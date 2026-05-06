const { AppError } = require("./app-error");
const { hashPassword } = require("./security");
const { loadConfigGroup } = require("./system-config");
const { generateDeviceIngestToken, loadExplicitDeviceIngestCredential } = require("./device-credentials");

const DEFAULT_TENANT_FEATURES = {
  enable_ai: true,
  enable_media: true,
  enable_openclaw: false,
  enable_alert_notifications: true
};

const DEFAULT_TENANT_LIMITS = {
  max_users: 50,
  max_gateways: 30,
  max_cameras: 20,
  max_ai_tasks_per_day: 200
};

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "enabled", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "disabled", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeInteger(value, fallback, min = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(parsed, min);
}

function normalizeTenantFeatures(rawConfig = {}) {
  return {
    enable_ai: normalizeBoolean(rawConfig.enable_ai, DEFAULT_TENANT_FEATURES.enable_ai),
    enable_media: normalizeBoolean(rawConfig.enable_media, DEFAULT_TENANT_FEATURES.enable_media),
    enable_openclaw: normalizeBoolean(rawConfig.enable_openclaw, DEFAULT_TENANT_FEATURES.enable_openclaw),
    enable_alert_notifications: normalizeBoolean(
      rawConfig.enable_alert_notifications,
      DEFAULT_TENANT_FEATURES.enable_alert_notifications
    )
  };
}

function normalizeTenantLimits(rawConfig = {}) {
  return {
    max_users: normalizeInteger(rawConfig.max_users, DEFAULT_TENANT_LIMITS.max_users, 1),
    max_gateways: normalizeInteger(rawConfig.max_gateways, DEFAULT_TENANT_LIMITS.max_gateways, 1),
    max_cameras: normalizeInteger(rawConfig.max_cameras, DEFAULT_TENANT_LIMITS.max_cameras, 0),
    max_ai_tasks_per_day: normalizeInteger(
      rawConfig.max_ai_tasks_per_day,
      DEFAULT_TENANT_LIMITS.max_ai_tasks_per_day,
      0
    )
  };
}

function buildTenantRuntimeConfigItems(tenantId, updatedBy, settings = {}) {
  const features = normalizeTenantFeatures(settings.features || {});
  const limits = normalizeTenantLimits(settings.limits || {});

  return [
    {
      tenantId,
      configGroup: "tenant_features",
      configKey: "enable_ai",
      configName: "启用 AI 能力",
      configValueJson: JSON.stringify(features.enable_ai),
      description: "控制租户是否可使用 AI 诊断和报告",
      updatedBy
    },
    {
      tenantId,
      configGroup: "tenant_features",
      configKey: "enable_media",
      configName: "启用媒体能力",
      configValueJson: JSON.stringify(features.enable_media),
      description: "控制租户是否可使用摄像头、抓图和媒体节点能力",
      updatedBy
    },
    {
      tenantId,
      configGroup: "tenant_features",
      configKey: "enable_openclaw",
      configName: "启用 OpenClaw",
      configValueJson: JSON.stringify(features.enable_openclaw),
      description: "控制租户是否开放 OpenClaw/外部助手访问",
      updatedBy
    },
    {
      tenantId,
      configGroup: "tenant_features",
      configKey: "enable_alert_notifications",
      configName: "启用告警通知",
      configValueJson: JSON.stringify(features.enable_alert_notifications),
      description: "控制租户是否允许通知渠道发送告警",
      updatedBy
    },
    {
      tenantId,
      configGroup: "tenant_limits",
      configKey: "max_users",
      configName: "最大用户数",
      configValueJson: JSON.stringify(limits.max_users),
      description: "租户允许创建的用户数量上限",
      updatedBy
    },
    {
      tenantId,
      configGroup: "tenant_limits",
      configKey: "max_gateways",
      configName: "最大网关数",
      configValueJson: JSON.stringify(limits.max_gateways),
      description: "租户允许创建的网关数量上限",
      updatedBy
    },
    {
      tenantId,
      configGroup: "tenant_limits",
      configKey: "max_cameras",
      configName: "最大摄像头数",
      configValueJson: JSON.stringify(limits.max_cameras),
      description: "租户允许创建的摄像头数量上限",
      updatedBy
    },
    {
      tenantId,
      configGroup: "tenant_limits",
      configKey: "max_ai_tasks_per_day",
      configName: "AI 每日任务上限",
      configValueJson: JSON.stringify(limits.max_ai_tasks_per_day),
      description: "租户每天可触发的 AI 任务数量上限",
      updatedBy
    }
  ];
}

async function upsertConfigItems(connection, items = []) {
  for (const item of items) {
    await connection.execute(
      `INSERT INTO sys_configs
        (tenant_id, config_group, config_key, config_name, config_value_json, description, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tenant_id = VALUES(tenant_id),
         config_name = VALUES(config_name),
         config_value_json = VALUES(config_value_json),
         description = VALUES(description),
         updated_by = VALUES(updated_by)`,
      [
        item.tenantId,
        item.configGroup,
        item.configKey,
        item.configName,
        item.configValueJson,
        item.description,
        item.updatedBy
      ]
    );
  }
}

async function loadTenantRuntimeSettings(connection, tenantId) {
  const [tenantRows] = await connection.execute(
    `SELECT id, tenant_name AS tenantName, tenant_code AS tenantCode, status
     FROM sys_tenants
     WHERE id = ?
     LIMIT 1`,
    [tenantId]
  );
  if (tenantRows.length === 0) {
    return null;
  }

  const [roleCountRows, dataScopeCountRows, userCountRows, gatewayCountRows, cameraCountRows] = await Promise.all([
    connection.execute("SELECT COUNT(*) AS roleCount FROM sys_roles WHERE tenant_id = ?", [tenantId]),
    connection.execute("SELECT COUNT(*) AS dataScopeCount FROM sys_data_scopes WHERE tenant_id = ?", [tenantId]),
    connection.execute("SELECT COUNT(*) AS userCount FROM sys_users WHERE tenant_id = ?", [tenantId]),
    connection.execute("SELECT COUNT(*) AS gatewayCount FROM iot_gateways WHERE tenant_id = ?", [tenantId]),
    connection.execute("SELECT COUNT(*) AS cameraCount FROM iot_cameras WHERE tenant_id = ?", [tenantId])
  ]);

  const [superAdminRows] = await connection.execute(
    `SELECT COUNT(*) AS superAdminCount
     FROM sys_users u
     JOIN sys_user_roles ur ON ur.user_id = u.id
     JOIN sys_roles r ON r.id = ur.role_id
     WHERE u.tenant_id = ?
       AND r.tenant_id = ?
       AND r.role_code = 'super_admin'`,
    [tenantId, tenantId]
  );

  const features = normalizeTenantFeatures(await loadConfigGroup("tenant_features", {
    connection,
    tenantId,
    fallbackToDefaultTenant: false,
    fallbackToGlobal: false
  }));
  const limits = normalizeTenantLimits(await loadConfigGroup("tenant_limits", {
    connection,
    tenantId,
    fallbackToDefaultTenant: false,
    fallbackToGlobal: false
  }));
  const explicitCredential = await loadExplicitDeviceIngestCredential({ connection, tenantId });

  return {
    tenant: tenantRows[0],
    features,
    limits,
    stats: {
      roleCount: Number(roleCountRows[0][0]?.roleCount || 0),
      dataScopeCount: Number(dataScopeCountRows[0][0]?.dataScopeCount || 0),
      userCount: Number(userCountRows[0][0]?.userCount || 0),
      gatewayCount: Number(gatewayCountRows[0][0]?.gatewayCount || 0),
      cameraCount: Number(cameraCountRows[0][0]?.cameraCount || 0),
      superAdminCount: Number(superAdminRows[0]?.superAdminCount || 0)
    },
    explicitCredentialConfigured: Boolean(explicitCredential.token)
  };
}

async function ensureTenantRoles(connection, tenantId, sourceTenantId) {
  const [sourceRoles] = await connection.execute(
    `SELECT role_code AS roleCode, role_name AS roleName, role_level AS roleLevel, status, description
     FROM sys_roles
     WHERE tenant_id = ?
     ORDER BY role_level ASC, id ASC`,
    [sourceTenantId]
  );

  for (const role of sourceRoles) {
    await connection.execute(
      `INSERT INTO sys_roles
        (tenant_id, role_code, role_name, role_level, status, description)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         role_name = VALUES(role_name),
         role_level = VALUES(role_level),
         status = VALUES(status),
         description = VALUES(description)`,
      [tenantId, role.roleCode, role.roleName, role.roleLevel, role.status, role.description]
    );
  }

  const [rows] = await connection.execute(
    `SELECT id, role_code AS roleCode
     FROM sys_roles
     WHERE tenant_id = ?`,
    [tenantId]
  );
  return new Map(rows.map((row) => [row.roleCode, Number(row.id)]));
}

async function ensureTenantDataScopes(connection, tenantId, sourceTenantId) {
  const [sourceScopes] = await connection.execute(
    `SELECT
       scope_code AS scopeCode,
       scope_name AS scopeName,
       scope_type AS scopeType,
       target_type AS targetType,
       target_id AS targetId,
       description
     FROM sys_data_scopes
     WHERE tenant_id = ?
     ORDER BY id ASC`,
    [sourceTenantId]
  );

  for (const scope of sourceScopes) {
    await connection.execute(
      `INSERT INTO sys_data_scopes
        (tenant_id, scope_code, scope_name, scope_type, target_type, target_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         scope_name = VALUES(scope_name),
         scope_type = VALUES(scope_type),
         target_type = VALUES(target_type),
         target_id = VALUES(target_id),
         description = VALUES(description)`,
      [
        tenantId,
        scope.scopeCode,
        scope.scopeName,
        scope.scopeType,
        scope.targetType,
        scope.targetId,
        scope.description
      ]
    );
  }

  const [rows] = await connection.execute(
    `SELECT id, scope_code AS scopeCode
     FROM sys_data_scopes
     WHERE tenant_id = ?`,
    [tenantId]
  );
  return new Map(rows.map((row) => [row.scopeCode, Number(row.id)]));
}

async function ensureTenantRolePermissions(connection, tenantId, sourceTenantId, targetRoleMap) {
  const [rows] = await connection.execute(
    `SELECT r.role_code AS roleCode, rp.permission_id AS permissionId
     FROM sys_roles r
     JOIN sys_role_permissions rp ON rp.role_id = r.id
     WHERE r.tenant_id = ?`,
    [sourceTenantId]
  );

  for (const row of rows) {
    const targetRoleId = targetRoleMap.get(row.roleCode);
    if (!targetRoleId) {
      continue;
    }
    await connection.execute(
      "INSERT IGNORE INTO sys_role_permissions (role_id, permission_id) VALUES (?, ?)",
      [targetRoleId, row.permissionId]
    );
  }
}

async function ensureTenantRoleDataScopes(connection, tenantId, sourceTenantId, targetRoleMap, targetScopeMap) {
  const [rows] = await connection.execute(
    `SELECT r.role_code AS roleCode, ds.scope_code AS scopeCode
     FROM sys_roles r
     JOIN sys_role_data_scopes rds ON rds.role_id = r.id
     JOIN sys_data_scopes ds ON ds.id = rds.data_scope_id
     WHERE r.tenant_id = ?
       AND ds.tenant_id = ?`,
    [sourceTenantId, sourceTenantId]
  );

  for (const row of rows) {
    const targetRoleId = targetRoleMap.get(row.roleCode);
    const targetScopeId = targetScopeMap.get(row.scopeCode);
    if (!targetRoleId || !targetScopeId) {
      continue;
    }
    await connection.execute(
      "INSERT IGNORE INTO sys_role_data_scopes (role_id, data_scope_id) VALUES (?, ?)",
      [targetRoleId, targetScopeId]
    );
  }
}

async function ensureTenantDeviceCredential(connection, tenantId, updatedBy) {
  const explicitCredential = await loadExplicitDeviceIngestCredential({ connection, tenantId });
  if (explicitCredential.token) {
    return explicitCredential.token;
  }

  const nextToken = generateDeviceIngestToken();
  await upsertConfigItems(connection, [
    {
      tenantId,
      configGroup: "device_credentials",
      configKey: "device_ingest_token",
      configName: "设备接入令牌",
      configValueJson: JSON.stringify(nextToken),
      description: "用于该租户设备上报与控制轮询的接入凭证",
      updatedBy
    }
  ]);
  return nextToken;
}

async function initializeTenantAdministrator(connection, tenantId, options) {
  const username = String(options.username || "").trim();
  const realName = String(options.realName || "").trim();
  const password = String(options.password || "").trim();
  const phone = options.phone ? String(options.phone).trim() : null;
  const email = options.email ? String(options.email).trim() : null;
  const remark = options.remark ? String(options.remark).trim() : null;

  const [existingUsers] = await connection.execute(
    "SELECT id FROM sys_users WHERE username = ? LIMIT 1",
    [username]
  );
  if (existingUsers.length > 0) {
    throw new AppError("username_conflict", "用户名已存在", 409);
  }

  if (phone) {
    const [existingPhoneUsers] = await connection.execute(
      "SELECT id FROM sys_users WHERE phone = ? LIMIT 1",
      [phone]
    );
    if (existingPhoneUsers.length > 0) {
      throw new AppError("phone_conflict", "手机号已存在", 409);
    }
  }

  if (email) {
    const [existingEmailUsers] = await connection.execute(
      "SELECT id FROM sys_users WHERE email = ? LIMIT 1",
      [email]
    );
    if (existingEmailUsers.length > 0) {
      throw new AppError("email_conflict", "邮箱已存在", 409);
    }
  }

  const [roleRows] = await connection.execute(
    `SELECT id
     FROM sys_roles
     WHERE tenant_id = ?
       AND role_code = 'super_admin'
     LIMIT 1`,
    [tenantId]
  );
  if (roleRows.length === 0) {
    throw new AppError("tenant_role_missing", "租户默认角色尚未初始化", 409);
  }

  const passwordHash = await hashPassword(password);
  const userNo = `TU${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const [result] = await connection.execute(
    `INSERT INTO sys_users
      (tenant_id, user_no, username, real_name, phone, email, password_hash, status, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'enabled', ?)`,
    [tenantId, userNo, username, realName, phone, email, passwordHash, remark]
  );
  await connection.execute(
    "INSERT IGNORE INTO sys_user_roles (user_id, role_id) VALUES (?, ?)",
    [result.insertId, roleRows[0].id]
  );

  return {
    id: Number(result.insertId),
    username,
    realName
  };
}

async function bootstrapTenantWorkspace(connection, tenantId, options) {
  const sourceTenantId = Number.parseInt(options.sourceTenantId, 10);
  const updatedBy = Number.parseInt(options.updatedBy, 10) || null;
  const roleMap = await ensureTenantRoles(connection, tenantId, sourceTenantId);
  const scopeMap = await ensureTenantDataScopes(connection, tenantId, sourceTenantId);
  await ensureTenantRolePermissions(connection, tenantId, sourceTenantId, roleMap);
  await ensureTenantRoleDataScopes(connection, tenantId, sourceTenantId, roleMap, scopeMap);
  await upsertConfigItems(
    connection,
    buildTenantRuntimeConfigItems(tenantId, updatedBy, {
      features: options.features,
      limits: options.limits
    })
  );
  const deviceToken = await ensureTenantDeviceCredential(connection, tenantId, updatedBy);

  let adminUser = null;
  if (options.adminUser) {
    adminUser = await initializeTenantAdministrator(connection, tenantId, options.adminUser);
  }

  return {
    roleCount: roleMap.size,
    dataScopeCount: scopeMap.size,
    deviceToken,
    adminUser
  };
}

module.exports = {
  DEFAULT_TENANT_FEATURES,
  DEFAULT_TENANT_LIMITS,
  normalizeTenantFeatures,
  normalizeTenantLimits,
  loadTenantRuntimeSettings,
  buildTenantRuntimeConfigItems,
  upsertConfigItems,
  bootstrapTenantWorkspace
};
