// @ts-check

const { pool, query } = require("./mysql");
const {
  verifyAccessToken,
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  verifyPassword,
  digestToken,
  generateTokenId
} = require("./security");
const config = require("./config");
const { AppError } = require("./app-error");
const { getLoginSecurityConfig } = require("./login-security-config");
const {
  buildImplicitTenant,
  hasTenantFoundation,
  normalizeTenantRow,
  normalizeTenantIdentifier,
  resolveDefaultTenant,
  resolveTenantByIdentifier
} = require("./tenant-foundation");

const authContextCache = new Map();
const OPENCLAW_READONLY_PERMISSION_CODES = [
  "dashboard:view",
  "monitor:view",
  "history:view",
  "alert:view",
  "ai:view",
  "rule:view"
];
const OPENCLAW_READONLY_AUTH_CONTEXT = {
  user: {
    id: 0,
    userNo: "svc-openclaw-readonly",
    username: "openclaw_readonly",
    realName: "OpenClaw只读助手",
    tenantId: null,
    tenantSlug: null,
    phone: null,
    email: null,
    status: "enabled",
    lastLoginAt: null
  },
  tenant: buildImplicitTenant(),
  roles: [
    {
      id: 0,
      roleCode: "openclaw_readonly",
      roleName: "OpenClaw只读角色",
      roleLevel: 999,
      status: "enabled"
    }
  ],
  permissionCodes: OPENCLAW_READONLY_PERMISSION_CODES,
  dataScopes: [
    {
      id: 0,
      scopeCode: "all_areas",
      scopeName: "全部区域",
      scopeType: "all",
      targetType: "area",
      targetId: null
    }
  ]
};

/**
 * @param {unknown} rows
 * @returns {Record<string, unknown>[]}
 */
function asRowArray(rows) {
  return Array.isArray(rows) ? /** @type {Record<string, unknown>[]} */ (rows) : [];
}

function parseBearerToken(request) {
  const authHeader = String(request.headers.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

function isOverrideActive(row, now) {
  if (row.approval_status !== "approved") {
    return false;
  }
  if (row.effective_from && new Date(row.effective_from) > now) {
    return false;
  }
  if (row.effective_to && new Date(row.effective_to) < now) {
    return false;
  }
  return true;
}

async function loadUserAuthContext(userId) {
  const cached = authContextCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const tenantFoundationEnabled = await hasTenantFoundation();
  const users = tenantFoundationEnabled
    ? asRowArray(await query(
      `SELECT
         u.id,
         u.user_no AS userNo,
         u.username,
         u.real_name AS realName,
         u.tenant_id AS tenantId,
         t.tenant_code AS tenantCode,
         t.tenant_name AS tenantName,
         t.tenant_slug AS tenantSlug,
         t.status AS tenantStatus,
         t.is_default AS tenantIsDefault,
         u.phone,
         u.email,
         u.status,
         u.last_login_at AS lastLoginAt
       FROM sys_users u
       LEFT JOIN sys_tenants t ON t.id = u.tenant_id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    ))
    : asRowArray(await query(
      `SELECT id, user_no AS userNo, username, real_name AS realName, phone, email, status, last_login_at AS lastLoginAt
       FROM sys_users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    ));
  const userRow = users[0];
  const tenant = normalizeTenantRow(userRow);
  const user = userRow
    ? {
      id: userRow.id,
      userNo: userRow.userNo,
      username: userRow.username,
      realName: userRow.realName,
      tenantId: tenant.id,
      tenantCode: tenant.tenantCode,
      tenantName: tenant.tenantName,
      tenantSlug: tenant.tenantSlug,
      tenantStatus: tenant.status,
      tenantIsDefault: tenant.isDefault,
      phone: userRow.phone,
      email: userRow.email,
      status: userRow.status,
      lastLoginAt: userRow.lastLoginAt
    }
    : null;
  if (!user || user.status !== "enabled") {
    authContextCache.delete(userId);
    return null;
  }

  const now = new Date();
  const [
    roles,
    defaultPermissionRows,
    overridePermissionRows,
    defaultDataScopeRows,
    overrideDataScopeRows
  ] = await Promise.all([
    query(
      `SELECT r.id, r.role_code AS roleCode, r.role_name AS roleName, r.role_level AS roleLevel, r.status
       FROM sys_user_roles ur
       JOIN sys_roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.status = 'enabled'
       ORDER BY r.role_level ASC`,
      [userId]
    ),
    query(
      `SELECT DISTINCT p.permission_code AS permissionCode
       FROM sys_user_roles ur
       JOIN sys_roles r ON r.id = ur.role_id AND r.status = 'enabled'
       JOIN sys_role_permissions rp ON rp.role_id = r.id
       JOIN sys_permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = ?`,
      [userId]
    ),
    query(
      `SELECT p.permission_code AS permissionCode, o.effect_type AS effectType,
              o.effective_from AS effectiveFrom, o.effective_to AS effectiveTo, o.approval_status AS approvalStatus
       FROM sys_user_permission_overrides o
       JOIN sys_permissions p ON p.id = o.permission_id
       WHERE o.user_id = ?`,
      [userId]
    ),
    query(
      `SELECT DISTINCT ds.id, ds.scope_code AS scopeCode, ds.scope_name AS scopeName,
              ds.scope_type AS scopeType, ds.target_type AS targetType, ds.target_id AS targetId
       FROM sys_user_roles ur
       JOIN sys_roles r ON r.id = ur.role_id AND r.status = 'enabled'
       JOIN sys_role_data_scopes rs ON rs.role_id = r.id
       JOIN sys_data_scopes ds ON ds.id = rs.data_scope_id
       WHERE ur.user_id = ?`,
      [userId]
    ),
    query(
      `SELECT ds.id, ds.scope_code AS scopeCode, ds.scope_name AS scopeName,
              ds.scope_type AS scopeType, ds.target_type AS targetType, ds.target_id AS targetId,
              o.effect_type AS effectType, o.effective_from AS effectiveFrom,
              o.effective_to AS effectiveTo, o.approval_status AS approvalStatus
       FROM sys_user_data_scope_overrides o
       JOIN sys_data_scopes ds ON ds.id = o.data_scope_id
       WHERE o.user_id = ?`,
      [userId]
    )
  ]);

  const permissions = new Set(asRowArray(defaultPermissionRows).map((row) => row.permissionCode));
  for (const row of asRowArray(overridePermissionRows)) {
    if (!isOverrideActive({
      approval_status: row.approvalStatus,
      effective_from: row.effectiveFrom,
      effective_to: row.effectiveTo
    }, now)) {
      continue;
    }
    if (row.effectType === "grant") {
      permissions.add(row.permissionCode);
    } else if (row.effectType === "revoke") {
      permissions.delete(row.permissionCode);
    }
  }

  const dataScopeMap = new Map(asRowArray(defaultDataScopeRows).map((row) => [row.scopeCode, row]));
  for (const row of asRowArray(overrideDataScopeRows)) {
    if (!isOverrideActive({
      approval_status: row.approvalStatus,
      effective_from: row.effectiveFrom,
      effective_to: row.effectiveTo
    }, now)) {
      continue;
    }
    if (row.effectType === "grant") {
      dataScopeMap.set(row.scopeCode, row);
    } else if (row.effectType === "revoke") {
      dataScopeMap.delete(row.scopeCode);
    }
  }

  const authContext = {
    user,
    tenant,
    roles,
    permissionCodes: Array.from(permissions).sort(),
    dataScopes: Array.from(dataScopeMap.values())
  };

  authContextCache.set(userId, {
    value: authContext,
    expiresAt: Date.now() + config.authCacheTtlMs
  });

  return authContext;
}

function getClientIp(request) {
  return String(
    request?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    request?.headers?.["x-real-ip"] ||
    request?.ip ||
    "127.0.0.1"
  );
}

function issueSessionAccessToken(authContext) {
  return issueAccessToken({
    sub: String(authContext.user.id),
    username: authContext.user.username,
    tenantId: authContext.user.tenantId,
    tenantCode: authContext.user.tenantCode,
    tenantSlug: authContext.user.tenantSlug
  });
}

function issueSessionRefreshToken(authContext, tokenId) {
  return issueRefreshToken({
    sub: String(authContext.user.id),
    username: authContext.user.username,
    tenantId: authContext.user.tenantId,
    tenantCode: authContext.user.tenantCode,
    tenantSlug: authContext.user.tenantSlug,
    jti: tokenId
  });
}

async function loginByUsername(username, password, options = {}) {
  const request = options.request || null;
  const loginSecurityConfig = options.loginSecurityConfig || null;
  const tenantIdentifier = normalizeTenantIdentifier(options.tenantIdentifier);
  const tenantFoundationEnabled = await hasTenantFoundation();
  const scopedTenant = tenantFoundationEnabled
    ? await resolveTenantByIdentifier(tenantIdentifier)
    : null;
  const loginTenant = tenantFoundationEnabled
    ? (scopedTenant || await resolveDefaultTenant())
    : null;

  if (tenantFoundationEnabled && tenantIdentifier && !scopedTenant?.id) {
    return null;
  }
  if (tenantFoundationEnabled && !loginTenant?.id) {
    return null;
  }

  const rows = tenantFoundationEnabled
    ? await query(
      `SELECT id, user_no AS userNo, username, real_name AS realName, password_hash AS passwordHash,
              status, login_failed_attempts AS loginFailedAttempts, locked_until AS lockedUntil, tenant_id AS tenantId
       FROM sys_users
       WHERE username = ?
         AND tenant_id = ?
       LIMIT 1`,
      [username, loginTenant.id]
    )
    : await query(
      `SELECT id, user_no AS userNo, username, real_name AS realName, password_hash AS passwordHash,
              status, login_failed_attempts AS loginFailedAttempts, locked_until AS lockedUntil
       FROM sys_users
       WHERE username = ?
       LIMIT 1`,
      [username]
    );
  const user = rows[0];
  if (!user) {
    return null;
  }
  const effectiveLoginSecurity = loginSecurityConfig || await getLoginSecurityConfig();
  const now = Date.now();
  const lockedUntilMs = user.lockedUntil ? new Date(user.lockedUntil).getTime() : 0;

  if (user.status === "disabled") {
    throw new AppError("account_disabled", "账号已被禁用，请联系管理员", 403);
  }

  if (user.status === "locked" && !effectiveLoginSecurity.lockEnabled) {
    await query(
      `UPDATE sys_users
       SET status = 'enabled',
           login_failed_attempts = 0,
           locked_until = NULL,
           last_login_failed_at = NULL
       WHERE id = ?`,
      [user.id]
    );
    user.status = "enabled";
    user.loginFailedAttempts = 0;
    user.lockedUntil = null;
  } else if (user.status === "locked" && lockedUntilMs && lockedUntilMs > now) {
    throw new AppError("account_locked", "登录失败次数过多，账号已临时锁定", 423, {
      lockedUntil: user.lockedUntil
    });
  }

  if (user.status === "locked" && (!lockedUntilMs || lockedUntilMs <= now)) {
    await query(
      `UPDATE sys_users
       SET status = 'enabled',
           login_failed_attempts = 0,
           locked_until = NULL
       WHERE id = ?`,
      [user.id]
    );
    user.status = "enabled";
    user.loginFailedAttempts = 0;
    user.lockedUntil = null;
  }

  const matched = await verifyPassword(password, user.passwordHash);
  if (!matched) {
    if (effectiveLoginSecurity.lockEnabled) {
      const nextAttempts = Number(user.loginFailedAttempts || 0) + 1;
      if (nextAttempts >= effectiveLoginSecurity.failureThreshold) {
        await query(
          `UPDATE sys_users
           SET login_failed_attempts = ?,
               last_login_failed_at = NOW(),
               locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE),
               status = 'locked'
           WHERE id = ?`,
          [nextAttempts, effectiveLoginSecurity.lockMinutes, user.id]
        );
        throw new AppError("account_locked", "登录失败次数过多，账号已临时锁定", 423, {
          lockMinutes: effectiveLoginSecurity.lockMinutes
        });
      }
      await query(
        `UPDATE sys_users
         SET login_failed_attempts = ?,
             last_login_failed_at = NOW()
         WHERE id = ?`,
        [nextAttempts, user.id]
      );
    }
    return null;
  }

  const authContext = await loadUserAuthContext(user.id);
  if (!authContext) {
    return null;
  }

  const clientIp = getClientIp(request);
  const userAgent = String(request?.headers?.["user-agent"] || "").slice(0, 255) || null;
  const tokenId = generateTokenId();
  const accessToken = issueSessionAccessToken(authContext);
  const refreshToken = issueSessionRefreshToken(authContext, tokenId);
  const refreshDigest = digestToken(refreshToken);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE sys_users
       SET last_login_at = NOW(),
           last_login_ip = ?,
           login_failed_attempts = 0,
           last_login_failed_at = NULL,
           locked_until = NULL,
           status = 'enabled'
       WHERE id = ?`,
      [clientIp, user.id]
    );
    await connection.execute(
      `INSERT INTO sys_refresh_tokens
        (user_id, token_digest, token_jti, client_ip, user_agent, issued_at, expires_at)
       VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [user.id, refreshDigest, tokenId, clientIp, userAgent, config.refreshTokenExpiresDays]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  invalidateAuthCache(user.id);

  return {
    accessToken,
    refreshToken,
    user: authContext.user,
    tenant: authContext.tenant,
    roles: authContext.roles,
    permissionCodes: authContext.permissionCodes,
    dataScopes: authContext.dataScopes
  };
}

async function authenticateRequest(request) {
  const token = parseBearerToken(request);
  if (!token) {
    return null;
  }
  if (token === config.openclawReadonlyToken) {
    return OPENCLAW_READONLY_AUTH_CONTEXT;
  }
  const payload = verifyAccessToken(token);
  const userId = Number.parseInt(payload.sub, 10);
  if (!Number.isFinite(userId)) {
    return null;
  }
  const authContext = await loadUserAuthContext(userId);
  if (!authContext) {
    return null;
  }

  const tokenTenantId = Number.parseInt(payload.tenantId, 10);
  if (Number.isFinite(tokenTenantId) && Number(authContext.tenant?.id || 0) !== tokenTenantId) {
    return null;
  }
  if (payload.tenantCode && authContext.tenant?.tenantCode && payload.tenantCode !== authContext.tenant.tenantCode) {
    return null;
  }
  if (payload.tenantSlug && authContext.tenant?.tenantSlug && payload.tenantSlug !== authContext.tenant.tenantSlug) {
    return null;
  }

  return authContext;
}

async function refreshSession(refreshToken, request = null) {
  if (!refreshToken) {
    throw new AppError("refresh_token_required", "缺少刷新令牌", 401);
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new AppError("invalid_refresh_token", "刷新令牌无效或已过期", 401, error.message);
  }

  const userId = Number.parseInt(payload.sub, 10);
  if (!Number.isFinite(userId) || !payload.jti) {
    throw new AppError("invalid_refresh_token", "刷新令牌无效", 401);
  }

  const tokenDigest = digestToken(refreshToken);
  const nextTokenId = generateTokenId();
  const clientIp = getClientIp(request);
  const userAgent = String(request?.headers?.["user-agent"] || "").slice(0, 255) || null;
  let authContext = null;
  let nextRefreshToken = null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, user_id AS userId, token_jti AS tokenJti, revoked_at AS revokedAt, expires_at AS expiresAt
       FROM sys_refresh_tokens
       WHERE token_digest = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenDigest]
    );
    const row = rows[0];
    if (!row || row.userId !== userId || row.tokenJti !== payload.jti) {
      throw new AppError("invalid_refresh_token", "刷新令牌不存在或已失效", 401);
    }
    if (row.revokedAt) {
      throw new AppError("invalid_refresh_token", "刷新令牌已失效", 401);
    }
    if (new Date(row.expiresAt).getTime() <= Date.now()) {
      throw new AppError("invalid_refresh_token", "刷新令牌已过期", 401);
    }

    authContext = await loadUserAuthContext(userId);
    if (!authContext) {
      throw new AppError("unauthorized", "用户不可用", 401);
    }

    nextRefreshToken = issueSessionRefreshToken(authContext, nextTokenId);
    const nextDigest = digestToken(nextRefreshToken);

    await connection.execute(
      `UPDATE sys_refresh_tokens
       SET revoked_at = NOW(),
           last_used_at = NOW(),
           replaced_by_token_digest = ?
       WHERE id = ?`,
      [nextDigest, row.id]
    );
    await connection.execute(
      `INSERT INTO sys_refresh_tokens
        (user_id, token_digest, token_jti, client_ip, user_agent, issued_at, expires_at)
       VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [userId, nextDigest, nextTokenId, clientIp, userAgent, config.refreshTokenExpiresDays]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const accessToken = issueSessionAccessToken(authContext);

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    user: authContext.user,
    tenant: authContext.tenant,
    roles: authContext.roles,
    permissionCodes: authContext.permissionCodes,
    dataScopes: authContext.dataScopes
  };
}

async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) {
    return false;
  }

  const tokenDigest = digestToken(refreshToken);
  await query(
    `UPDATE sys_refresh_tokens
     SET revoked_at = IFNULL(revoked_at, NOW())
     WHERE token_digest = ?
       AND revoked_at IS NULL`,
    [tokenDigest]
  );
  return true;
}

function hasPermission(authContext, permissions) {
  if (!permissions || permissions.length === 0) {
    return true;
  }
  const granted = new Set(authContext.permissionCodes);
  return permissions.every((permission) => granted.has(permission));
}

module.exports = {
  parseBearerToken,
  authenticateRequest,
  loadUserAuthContext,
  loginByUsername,
  refreshSession,
  revokeRefreshToken,
  hasPermission,
  invalidateAuthCache,
  invalidateAuthCacheForUsers,
  clearAuthCache
};

function invalidateAuthCache(userId) {
  if (!userId) {
    return;
  }
  authContextCache.delete(Number(userId));
}

function invalidateAuthCacheForUsers(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return;
  }
  userIds.forEach((userId) => invalidateAuthCache(userId));
}

function clearAuthCache() {
  authContextCache.clear();
}
