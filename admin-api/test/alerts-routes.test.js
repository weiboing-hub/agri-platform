const { after, afterEach, test } = require("node:test");
const assert = require("node:assert/strict");
const Fastify = require("fastify");

const mysql = require("../src/lib/mysql");
const audit = require("../src/lib/audit");
const notificationProvider = require("../src/lib/notification-provider");

let app = null;

const originalMysql = {
  pool: mysql.pool,
  query: mysql.query
};
const originalAuditLogOperation = audit.logOperation;
const originalSendNotification = notificationProvider.sendNotification;

function loadFreshAlertRoutes() {
  const routePath = require.resolve("../src/routes/alerts");
  delete require.cache[routePath];
  return require("../src/routes/alerts");
}

function createFakeConnection(results = []) {
  let index = 0;
  return {
    began: false,
    committed: false,
    rolledBack: false,
    released: false,
    calls: [],
    async beginTransaction() {
      this.began = true;
    },
    async execute(sql, params) {
      this.calls.push({ sql, params });
      const next = results[index++];
      return next === undefined ? [{}] : next;
    },
    async commit() {
      this.committed = true;
    },
    async rollback() {
      this.rolledBack = true;
    },
    release() {
      this.released = true;
    }
  };
}

async function createAlertRouteApp(authContext) {
  const alertRoutes = loadFreshAlertRoutes();
  const fastify = Fastify();
  fastify.decorateRequest("auth", null);
  fastify.decorate("authenticate", async (request) => {
    request.auth = authContext;
  });
  fastify.decorate("requirePermissions", () => async (request) => {
    request.auth = authContext;
  });
  await fastify.register(alertRoutes);
  return fastify;
}

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }

  mysql.pool = originalMysql.pool;
  mysql.query = originalMysql.query;
  audit.logOperation = originalAuditLogOperation;
  notificationProvider.sendNotification = originalSendNotification;
  delete require.cache[require.resolve("../src/routes/alerts")];
});

after(async () => {
  try {
    await originalMysql.pool.end();
  } catch {
    // ignore pool shutdown errors in isolated test runs
  }
});

test("alert transition route applies assign action and records transition", async () => {
  const fakeConnection = createFakeConnection([
    [[{ id: 9, status: "new", areaId: 7, assignedTo: null, reopenCount: 2 }]],
    [[{ id: 99 }]],
    [{ affectedRows: 1 }],
    [{ insertId: 77 }]
  ]);

  mysql.pool = {
    async getConnection() {
      return fakeConnection;
    }
  };
  mysql.query = async () => [];
  audit.logOperation = async () => {};
  notificationProvider.sendNotification = async () => ({ provider: "noop", responseText: "ok" });

  app = await createAlertRouteApp({
    user: { id: 11 },
    permissionCodes: ["alert:assign"],
    dataScopes: []
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/alerts/9/transitions",
    payload: {
      actionType: "assign",
      assignedTo: 99,
      remarkText: "转交值班员"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.fromStatus, "new");
  assert.equal(body.data.toStatus, "new");
  assert.equal(body.data.assignedTo, 99);
  assert.equal(body.data.reopenCount, 2);
  assert.equal(fakeConnection.began, true);
  assert.equal(fakeConnection.committed, true);
  assert.equal(fakeConnection.rolledBack, false);
  assert.equal(fakeConnection.released, true);
});

test("notification resend route returns failed status when provider send fails", async () => {
  const fakeConnection = createFakeConnection([
    [[{
      id: 3,
      notificationNo: "NT-001",
      alertId: 8,
      sendStatus: "failed",
      retryCount: 1,
      receiverValue: "ops@example.com",
      channelType: "webhook",
      contentSummary: "通知内容",
      alertNo: "AL-001",
      alertTitle: "土壤湿度过低"
    }]],
    [{ affectedRows: 1 }]
  ]);

  mysql.pool = {
    async getConnection() {
      return fakeConnection;
    }
  };
  mysql.query = async () => [];
  audit.logOperation = async () => {};
  notificationProvider.sendNotification = async () => {
    throw new Error("provider offline");
  };

  app = await createAlertRouteApp({
    user: { id: 12 },
    permissionCodes: ["alert:assign"],
    dataScopes: []
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/notifications/3/resend"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.message, "通知重发失败");
  assert.equal(body.data.sendStatus, "failed");
  assert.equal(body.data.retryCount, 2);
  assert.match(body.data.responseText, /provider offline/);
  assert.equal(fakeConnection.committed, true);
  assert.equal(fakeConnection.rolledBack, false);
});
