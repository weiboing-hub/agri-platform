// @ts-check

/**
 * @template T
 * @param {T} data
 * @param {string} [message]
 * @returns {{ ok: true; message: string; data: T }}
 */
function ok(data, message = "success") {
  return {
    ok: true,
    message,
    data
  };
}

/**
 * @param {{ code: (statusCode: number) => unknown }} reply
 * @param {number} statusCode
 * @param {string} message
 * @param {string} [code]
 * @param {unknown} [details]
 * @returns {{ ok: false; error: string; message: string; details: unknown }}
 */
function fail(reply, statusCode, message, code = "bad_request", details = null) {
  reply.code(statusCode);
  return {
    ok: false,
    error: code,
    message,
    details
  };
}

module.exports = {
  ok,
  fail
};
