// @ts-check

const mysql = require("mysql2/promise");
const config = require("./config");

/**
 * @typedef {(sql: string, values?: any) => Promise<[any, any?]>} SqlExecute
 *
 * @typedef {{
 *   execute: SqlExecute;
 * }} SqlConnection
 */

const pool = mysql.createPool(config.mysql);

/**
 * @returns {Promise<boolean>}
 */
async function ping() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

/**
 * @param {string} sql
 * @param {any} [params]
 * @returns {Promise<any>}
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  pool,
  ping,
  query
};
