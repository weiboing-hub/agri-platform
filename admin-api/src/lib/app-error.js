// @ts-check

/**
 * @typedef {Record<string, unknown> | null} AppErrorDetails
 */

class AppError extends Error {
  /**
   * @param {string | null | undefined} code
   * @param {string} message
   * @param {number} [httpStatus]
   * @param {AppErrorDetails} [details]
   */
  constructor(code, message, httpStatus = 400, details = null) {
    super(message);
    this.name = "AppError";
    this.code = code || "bad_request";
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

/**
 * @param {unknown} error
 * @returns {error is AppError}
 */
function isAppError(error) {
  return error instanceof AppError;
}

/**
 * @param {unknown} error
 * @returns {AppError}
 */
function toAppError(error) {
  const candidate =
    typeof error === "object" && error
      ? /** @type {{
          validation?: unknown;
          code?: string;
          message?: string;
          httpStatus?: number;
          details?: AppErrorDetails;
        }} */ (error)
      : null;

  if (isAppError(error)) {
    return error;
  }

  if (candidate?.validation) {
    return new AppError("validation_error", "请求参数校验失败", 400, /** @type {AppErrorDetails} */ (candidate.validation));
  }

  if (candidate?.code === "ER_DUP_ENTRY") {
    return new AppError("conflict", "数据已存在，不能重复创建", 409);
  }

  if (candidate?.code === "ER_NO_REFERENCED_ROW_2") {
    return new AppError("invalid_reference", "存在无效的关联对象", 400);
  }

  return new AppError(
    candidate?.code || "internal_error",
    candidate?.message || "服务器内部错误",
    Number.isFinite(candidate?.httpStatus) ? /** @type {number} */ (candidate.httpStatus) : 500,
    candidate?.details || null
  );
}

module.exports = {
  AppError,
  isAppError,
  toAppError
};
