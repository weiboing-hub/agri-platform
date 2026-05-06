// @ts-check

const config = require("./config");
const { pool } = require("./mysql");
const { hashPassword } = require("./security");
const { hasTenantFoundation, resolveDefaultTenantId } = require("./tenant-foundation");

/**
 * @param {unknown} result
 * @returns {number}
 */
function getInsertId(result) {
  const candidate =
    typeof result === "object" && result
      ? /** @type {{ insertId?: unknown }} */ (result)
      : null;
  const insertId = Number(candidate?.insertId);
  return Number.isFinite(insertId) ? insertId : 0;
}

async function ensureBootstrapAdmin() {
  if (!config.bootstrapAdmin.enabled) {
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tenantFoundationEnabled = await hasTenantFoundation(connection);
    const defaultTenantId = tenantFoundationEnabled ? await resolveDefaultTenantId(connection) : null;

    const [userRows] = await connection.execute(
      "SELECT id FROM sys_users WHERE username = ? LIMIT 1",
      [config.bootstrapAdmin.username]
    );

    let userId = userRows[0]?.id || null;
    if (!userId) {
      const passwordHash = await hashPassword(config.bootstrapAdmin.password);
      const userNo = `U${Date.now()}`;
      const [result] = tenantFoundationEnabled
        ? await connection.execute(
          `INSERT INTO sys_users
            (tenant_id, user_no, username, real_name, password_hash, status, remark)
           VALUES (?, ?, ?, ?, ?, 'enabled', ?)`,
          [
            defaultTenantId,
            userNo,
            config.bootstrapAdmin.username,
            config.bootstrapAdmin.realName,
            passwordHash,
            "开发环境自动初始化管理员"
          ]
        )
        : await connection.execute(
          `INSERT INTO sys_users
            (user_no, username, real_name, password_hash, status, remark)
           VALUES (?, ?, ?, ?, 'enabled', ?)`,
          [
            userNo,
            config.bootstrapAdmin.username,
            config.bootstrapAdmin.realName,
            passwordHash,
            "开发环境自动初始化管理员"
          ]
        );
      userId = getInsertId(result);
    }

    const [roleRows] = tenantFoundationEnabled
      ? await connection.execute(
        "SELECT id FROM sys_roles WHERE tenant_id = ? AND role_code = 'super_admin' LIMIT 1",
        [defaultTenantId]
      )
      : await connection.execute(
        "SELECT id FROM sys_roles WHERE role_code = 'super_admin' LIMIT 1"
      );
    const superAdminRoleId = roleRows[0]?.id || null;

    if (superAdminRoleId) {
      await connection.execute(
        "INSERT IGNORE INTO sys_user_roles (user_id, role_id) VALUES (?, ?)",
        [userId, superAdminRoleId]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ensureBootstrapAdmin
};
