// @ts-check

const crypto = require("crypto");
const config = require("./config");

/**
 * @typedef {{
 *   [key: string]: any;
 *   tokenType?: string;
 *   iat?: number;
 *   exp?: number;
 * }} TokenPayload
 *
 * @typedef {{
 *   expiresInSeconds?: number;
 *   secret?: string;
 *   tokenType?: string;
 * }} SignedTokenOptions
 */

/**
 * @param {string | Buffer} input
 * @returns {string}
 */
function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * @param {string} input
 * @returns {string}
 */
function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

/**
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await /** @type {Promise<Buffer>} */ (new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(/** @type {Buffer} */ (key));
    });
  }));

  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

/**
 * @param {string} password
 * @param {string | null | undefined} storedHash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("scrypt$")) {
    return false;
  }

  const [, salt, keyHex] = storedHash.split("$");
  const derivedKey = await /** @type {Promise<Buffer>} */ (new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(/** @type {Buffer} */ (key));
    });
  }));

  const storedBuffer = Buffer.from(keyHex, "hex");
  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }
  return crypto.timingSafeEqual(storedBuffer, derivedKey);
}

/**
 * @param {TokenPayload} payload
 * @param {SignedTokenOptions} [options]
 * @returns {string}
 */
function issueSignedToken(payload, options = {}) {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresInSeconds = Number.isFinite(options.expiresInSeconds)
    ? options.expiresInSeconds
    : config.tokenExpiresHours * 3600;
  const expiresAt = issuedAt + expiresInSeconds;
  const body = {
    ...payload,
    tokenType: options.tokenType || "access",
    iat: issuedAt,
    exp: expiresAt
  };

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(body));
  const signature = crypto
    .createHmac("sha256", options.secret || config.tokenSecret)
    .update(`${headerPart}.${payloadPart}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${headerPart}.${payloadPart}.${signature}`;
}

/**
 * @param {string} token
 * @param {SignedTokenOptions} [options]
 * @returns {TokenPayload}
 */
function verifySignedToken(token, options = {}) {
  if (!token || typeof token !== "string") {
    throw new Error("missing token");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("invalid token format");
  }

  const [headerPart, payloadPart, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", options.secret || config.tokenSecret)
    .update(`${headerPart}.${payloadPart}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("invalid token signature");
  }

  const payload = /** @type {TokenPayload} */ (JSON.parse(base64UrlDecode(payloadPart)));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw new Error("token expired");
  }
  if (options.tokenType && payload.tokenType !== options.tokenType) {
    throw new Error("invalid token type");
  }

  return payload;
}

/**
 * @param {TokenPayload} payload
 * @returns {string}
 */
function issueAccessToken(payload) {
  return issueSignedToken(payload, {
    secret: config.tokenSecret,
    tokenType: "access",
    expiresInSeconds: config.accessTokenExpiresMinutes * 60
  });
}

/**
 * @param {string} token
 * @returns {TokenPayload}
 */
function verifyAccessToken(token) {
  return verifySignedToken(token, {
    secret: config.tokenSecret,
    tokenType: "access"
  });
}

/**
 * @param {TokenPayload} payload
 * @returns {string}
 */
function issueRefreshToken(payload) {
  return issueSignedToken(payload, {
    secret: config.refreshTokenSecret,
    tokenType: "refresh",
    expiresInSeconds: config.refreshTokenExpiresDays * 24 * 3600
  });
}

/**
 * @param {string} token
 * @returns {TokenPayload}
 */
function verifyRefreshToken(token) {
  return verifySignedToken(token, {
    secret: config.refreshTokenSecret,
    tokenType: "refresh"
  });
}

/**
 * @param {unknown} token
 * @returns {string}
 */
function digestToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

/**
 * @returns {string}
 */
function generateTokenId() {
  return crypto.randomBytes(16).toString("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueSignedToken,
  verifySignedToken,
  issueToken: issueAccessToken,
  verifyToken: verifyAccessToken,
  issueAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  digestToken,
  generateTokenId
};
