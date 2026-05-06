// @ts-check

const Fastify = require("fastify");
const cors = require("@fastify/cors");
const multipart = require("@fastify/multipart");
const swagger = require("@fastify/swagger");
const swaggerUi = require("@fastify/swagger-ui");
const config = require("./lib/config");
const db = require("./lib/mysql");
const { ensureBootstrapAdmin } = require("./lib/bootstrap");
const { authenticateRequest, hasPermission } = require("./lib/auth");
const { cleanupRateLimitBuckets } = require("./lib/rate-limit");
const { startAutomationRuleScheduler } = require("./lib/automation-rule-scheduler");
const { startCapturePlanScheduler } = require("./lib/capture-plan-scheduler");
const { fail } = require("./lib/response");
const { toAppError } = require("./lib/app-error");
const { registerOpenApi } = require("./lib/openapi");
const authRoutes = require("./routes/auth");
const metaRoutes = require("./routes/meta");
const dashboardRoutes = require("./routes/dashboard");
const deviceRoutes = require("./routes/devices");
const monitorRoutes = require("./routes/monitor");
const alertRoutes = require("./routes/alerts");
const controlRoutes = require("./routes/controls");
const aiRoutes = require("./routes/ai");
const cropRoutes = require("./routes/crops");
const systemRoutes = require("./routes/system");
const iotRoutes = require("./routes/iot");
const mediaRoutes = require("./routes/media");
const firmwareRoutes = require("./routes/firmware");

function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch {
    return "";
  }
}

function isSameOriginRequest(requestOrigin, requestHost, protocolHeader) {
  const normalizedOrigin = normalizeOrigin(requestOrigin);
  if (!normalizedOrigin || !requestHost) {
    return false;
  }
  const forwardedProtocol = String(protocolHeader || "http").split(",")[0].trim() || "http";
  return normalizedOrigin === `${forwardedProtocol}://${requestHost}`;
}

async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: 20 * 1024 * 1024
  });
  const authAwareApp = /** @type {any} */ (app);

  await app.register(cors, {
    delegator: (request, callback) => {
      const requestOrigin = request.headers.origin;
      const allowOrigin =
        config.cors.allowAll ||
        !requestOrigin ||
        config.cors.allowedOrigins.includes(normalizeOrigin(requestOrigin)) ||
        isSameOriginRequest(requestOrigin, request.headers.host, request.headers["x-forwarded-proto"]);

      callback(null, {
        origin: allowOrigin,
        credentials: config.cors.credentials,
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
      });
    }
  });
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1
    }
  });
  app.addContentTypeParser(/^image\/.+/, { parseAs: "buffer" }, (request, payload, done) => {
    done(null, payload);
  });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (request, payload, done) => {
    done(null, payload);
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Agri Admin API",
        description: "智能农业环境监测与自动控制平台 API",
        version: "0.1.0"
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      }
    }
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false
    }
  });
  registerOpenApi(app);

  app.decorateRequest("auth", null);

  app.decorate("authenticate", async (request, reply) => {
    try {
      const authContext = await authenticateRequest(request);
      if (!authContext) {
        reply.send(fail(reply, 401, "缺少有效登录状态", "unauthorized"));
        return;
      }
      request.auth = authContext;
    } catch (error) {
      reply.send(fail(reply, 401, "登录状态无效或已过期", "unauthorized", error.message));
    }
  });

  app.decorate("requirePermissions", (permissionCodes) => async (request, reply) => {
    await authAwareApp.authenticate(request, reply);
    if (reply.sent) {
      return;
    }
    if (!hasPermission(request.auth, permissionCodes)) {
      reply.send(fail(reply, 403, "没有访问该资源的权限", "forbidden", {
        required: permissionCodes,
        granted: request.auth.permissionCodes
      }));
    }
  });

  app.decorate("requireAnyPermissions", (permissionCodes) => async (request, reply) => {
    await authAwareApp.authenticate(request, reply);
    if (reply.sent) {
      return;
    }
    if (!Array.isArray(permissionCodes) || permissionCodes.length === 0) {
      return;
    }

    const granted = new Set(request.auth.permissionCodes || []);
    if (!permissionCodes.some((permissionCode) => granted.has(permissionCode))) {
      reply.send(fail(reply, 403, "没有访问该资源的权限", "forbidden", {
        requiredAnyOf: permissionCodes,
        granted: request.auth.permissionCodes
      }));
    }
  });

  app.get("/healthz", async () => {
    let dbHealthy = true;
    let dbError = null;

    try {
      await db.ping();
    } catch (error) {
      dbHealthy = false;
      dbError = error.message;
    }

    return {
      ok: dbHealthy,
      message: dbHealthy ? "success" : "database unavailable",
      data: {
        service: "agri-admin-api",
        host: config.host,
        port: config.port,
        database: config.mysql.database,
        dbHealthy,
        dbError
      }
    };
  });

  app.setNotFoundHandler((request, reply) =>
    fail(reply, 404, `Route ${request.method}:${request.url} not found`, "route_not_found")
  );

  app.setErrorHandler((error, request, reply) => {
    const appError = toAppError(error);
    const authRequest = /** @type {{ auth?: any, method?: string, url?: string }} */ (request);
    app.log.error(
      {
        err: error,
        method: request.method,
        url: request.url,
        userId: authRequest.auth?.user?.id || null
      },
      appError.message
    );
    reply.code(appError.httpStatus).send({
      ok: false,
      error: appError.code,
      message: appError.message,
      details: appError.details || null
    });
  });

  await app.register(authRoutes);
  await app.register(metaRoutes);
  await app.register(dashboardRoutes);
  await app.register(deviceRoutes);
  await app.register(monitorRoutes);
  await app.register(alertRoutes);
  await app.register(controlRoutes);
  await app.register(aiRoutes);
  await app.register(cropRoutes);
  await app.register(systemRoutes);
  await app.register(iotRoutes);
  await app.register(mediaRoutes);
  await app.register(firmwareRoutes);

  return app;
}

async function start() {
  await ensureBootstrapAdmin();
  const app = await buildServer();
  setInterval(cleanupRateLimitBuckets, 60 * 1000).unref();
  startAutomationRuleScheduler(app.log);
  startCapturePlanScheduler(app.log);
  try {
    await app.listen({
      host: config.host,
      port: config.port
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = {
  buildServer,
  start,
  normalizeOrigin,
  isSameOriginRequest
};
