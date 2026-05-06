const test = require("node:test");
const assert = require("node:assert/strict");

const {
  digestToken,
  generateTokenId,
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} = require("../src/lib/security");

test("access tokens round-trip expected payload fields", () => {
  const token = issueAccessToken({
    userId: 1,
    tenantId: 2,
    permissionCodes: ["dashboard:view"]
  });

  const payload = verifyAccessToken(token);
  assert.equal(payload.userId, 1);
  assert.equal(payload.tenantId, 2);
  assert.deepEqual(payload.permissionCodes, ["dashboard:view"]);
  assert.equal(payload.tokenType, "access");
  assert.ok(payload.exp > payload.iat);
});

test("refresh tokens round-trip and reject wrong token type verification", () => {
  const token = issueRefreshToken({
    userId: 3,
    tenantId: 4
  });

  const refreshPayload = verifyRefreshToken(token);
  assert.equal(refreshPayload.userId, 3);
  assert.equal(refreshPayload.tokenType, "refresh");

  assert.throws(() => verifyAccessToken(token), /invalid token signature|invalid token type/);
});

test("digestToken is deterministic and generateTokenId creates opaque ids", () => {
  const token = "sample-token";
  assert.equal(digestToken(token), digestToken(token));
  assert.notEqual(generateTokenId(), generateTokenId());
  assert.match(generateTokenId(), /^[a-f0-9]{32}$/);
});
