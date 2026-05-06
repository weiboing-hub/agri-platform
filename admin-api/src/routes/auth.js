const { loginByUsername, refreshSession, revokeRefreshToken } = require("../lib/auth");
const { consumeRateLimit } = require("../lib/rate-limit");
const { ok, fail } = require("../lib/response");
const { AppError } = require("../lib/app-error");
const { getLoginSecurityConfig } = require("../lib/login-security-config");
const { listEnabledTenants, normalizeTenantIdentifier } = require("../lib/tenant-foundation");

async function authRoutes(app) {
  app.get("/api/v1/auth/tenant-options", {
    schema: {
      tags: ["Auth"],
      summary: "获取登录页可选租户"
    }
  }, async () => {
    const tenants = await listEnabledTenants();
    return ok(tenants.map((tenant) => ({
      id: tenant.id,
      tenantCode: tenant.tenantCode,
      tenantName: tenant.tenantName,
      tenantSlug: tenant.tenantSlug,
      isDefault: tenant.isDefault
    })));
  });

  app.post("/api/v1/auth/login", {
    schema: {
      tags: ["Auth"],
      summary: "账号密码登录",
      body: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string" },
          password: { type: "string" },
          tenantIdentifier: { type: "string" },
          tenantCode: { type: "string" }
        }
      }
    }
  }, async (request, reply) => {
    const username = String(request.body?.username || "").trim();
    const password = String(request.body?.password || "");
    const tenantIdentifier = normalizeTenantIdentifier(
      request.body?.tenantIdentifier ?? request.body?.tenantCode
    );
    const loginSecurityConfig = await getLoginSecurityConfig();

    if (!username || !password) {
      return fail(reply, 400, "用户名和密码不能为空");
    }

    if (loginSecurityConfig.rateLimitEnabled) {
      const loginLimit = consumeRateLimit({
        key: `login:${request.ip || "unknown"}:${tenantIdentifier || "default"}:${username.toLowerCase()}`,
        windowMs: loginSecurityConfig.rateLimitLoginWindowMs,
        max: loginSecurityConfig.rateLimitLoginMax
      });
      if (!loginLimit.allowed) {
        reply.header("Retry-After", Math.max(1, Math.ceil((loginLimit.resetAt - Date.now()) / 1000)));
        return fail(reply, 429, "登录尝试过于频繁，请稍后再试", "rate_limited");
      }
    }

    let result;
    try {
      result = await loginByUsername(username, password, {
        request,
        loginSecurityConfig,
        tenantIdentifier
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw error;
    }
    if (!result) {
      return fail(reply, 401, "用户名或密码错误", "invalid_credentials");
    }

    return ok(result);
  });

  app.post("/api/v1/auth/refresh", {
    schema: {
      tags: ["Auth"],
      summary: "刷新访问令牌",
      body: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string" }
        }
      }
    }
  }, async (request) => {
    const refreshToken = String(request.body?.refreshToken || "").trim();
    if (!refreshToken) {
      throw new AppError("refresh_token_required", "缺少刷新令牌", 401);
    }
    const result = await refreshSession(refreshToken, request);
    return ok(result, "刷新成功");
  });

  app.post("/api/v1/auth/logout", {
    schema: {
      tags: ["Auth"],
      summary: "登出并吊销刷新令牌",
      body: {
        type: "object",
        properties: {
          refreshToken: { type: "string" }
        }
      }
    }
  }, async (request) => {
    const refreshToken = String(request.body?.refreshToken || "").trim();
    await revokeRefreshToken(refreshToken);
    return ok({ revoked: Boolean(refreshToken) }, "已退出登录");
  });

  app.get(
    "/api/v1/auth/me",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["Auth"],
        summary: "获取当前登录用户"
      }
    },
    async (request) =>
      ok({
        user: request.auth.user,
        tenant: request.auth.tenant || null,
        roles: request.auth.roles,
        permissionCodes: request.auth.permissionCodes,
        dataScopes: request.auth.dataScopes
      })
  );
}

module.exports = authRoutes;
