const { after, afterEach, test } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/lib/config");
const db = require("../src/lib/mysql");
const { pool } = require("../src/lib/mysql");
const { buildServer } = require("../src/server");

let app = null;

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
  db.ping = originalPing;
  config.cors.allowAll = originalCors.allowAll;
  config.cors.allowedOrigins = [...originalCors.allowedOrigins];
});

const originalPing = db.ping;
const originalCors = {
  allowAll: config.cors.allowAll,
  allowedOrigins: [...config.cors.allowedOrigins]
};

after(async () => {
  await pool.end();
});

test("healthz returns success when database ping is healthy", async () => {
  db.ping = async () => true;
  app = await buildServer();

  const response = await app.inject({
    method: "GET",
    url: "/healthz"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.dbHealthy, true);
  assert.equal(body.data.service, "agri-admin-api");
});

test("healthz reports database unavailable when ping fails", async () => {
  db.ping = async () => {
    throw new Error("db offline");
  };
  app = await buildServer();

  const response = await app.inject({
    method: "GET",
    url: "/healthz"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, false);
  assert.equal(body.message, "database unavailable");
  assert.equal(body.data.dbHealthy, false);
  assert.match(body.data.dbError, /db offline/);
});

test("cors returns allow-origin for configured origins", async () => {
  db.ping = async () => true;
  config.cors.allowAll = false;
  config.cors.allowedOrigins = ["http://82.156.45.208"];
  app = await buildServer();

  const response = await app.inject({
    method: "GET",
    url: "/healthz",
    headers: {
      origin: "http://82.156.45.208"
    }
  });

  assert.equal(response.headers["access-control-allow-origin"], "http://82.156.45.208");
});

test("cors blocks unknown origins when allowAll is disabled", async () => {
  db.ping = async () => true;
  config.cors.allowAll = false;
  config.cors.allowedOrigins = ["http://82.156.45.208"];
  app = await buildServer();

  const response = await app.inject({
    method: "GET",
    url: "/healthz",
    headers: {
      origin: "http://evil.example.com"
    }
  });

  assert.equal(response.headers["access-control-allow-origin"], undefined);
});

test("not-found handler returns structured error payload", async () => {
  db.ping = async () => true;
  app = await buildServer();

  const response = await app.inject({
    method: "GET",
    url: "/missing-route"
  });

  assert.equal(response.statusCode, 404);
  const body = response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "route_not_found");
});

test("requirePermissions blocks requests missing all required permissions", async () => {
  db.ping = async () => true;
  app = await buildServer();
  app.authenticate = async (request) => {
    request.auth = {
      user: { id: 1 },
      permissionCodes: ["dashboard:view"]
    };
  };
  app.get(
    "/_test/protected",
    {
      preHandler: [app.requirePermissions(["alert:view"])]
    },
    async () => ({ ok: true })
  );

  const response = await app.inject({
    method: "GET",
    url: "/_test/protected"
  });

  assert.equal(response.statusCode, 403);
  const body = response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "forbidden");
  assert.deepEqual(body.details.required, ["alert:view"]);
});

test("requirePermissions allows requests when every permission is granted", async () => {
  db.ping = async () => true;
  app = await buildServer();
  app.authenticate = async (request) => {
    request.auth = {
      user: { id: 1 },
      permissionCodes: ["alert:view", "dashboard:view"]
    };
  };
  app.get(
    "/_test/protected",
    {
      preHandler: [app.requirePermissions(["alert:view"])]
    },
    async () => ({ ok: true, message: "allowed" })
  );

  const response = await app.inject({
    method: "GET",
    url: "/_test/protected"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, message: "allowed" });
});

test("requireAnyPermissions accepts requests when one permission matches", async () => {
  db.ping = async () => true;
  app = await buildServer();
  app.authenticate = async (request) => {
    request.auth = {
      user: { id: 2 },
      permissionCodes: ["monitor:view"]
    };
  };
  app.get(
    "/_test/any",
    {
      preHandler: [app.requireAnyPermissions(["alert:view", "monitor:view"])]
    },
    async () => ({ ok: true, mode: "any" })
  );

  const response = await app.inject({
    method: "GET",
    url: "/_test/any"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, mode: "any" });
});

test("requireAnyPermissions rejects requests when no permission matches", async () => {
  db.ping = async () => true;
  app = await buildServer();
  app.authenticate = async (request) => {
    request.auth = {
      user: { id: 3 },
      permissionCodes: ["rule:view"]
    };
  };
  app.get(
    "/_test/any",
    {
      preHandler: [app.requireAnyPermissions(["alert:view", "monitor:view"])]
    },
    async () => ({ ok: true })
  );

  const response = await app.inject({
    method: "GET",
    url: "/_test/any"
  });

  assert.equal(response.statusCode, 403);
  const body = response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "forbidden");
  assert.deepEqual(body.details.requiredAnyOf, ["alert:view", "monitor:view"]);
});
