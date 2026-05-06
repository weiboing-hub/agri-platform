const { after, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_TENANT_CODE,
  DEFAULT_TENANT_NAME,
  buildImplicitTenant,
  extractTenantId,
  normalizeTenantIdentifier,
  normalizeTenantRow
} = require("../src/lib/tenant-foundation");
const { pool } = require("../src/lib/mysql");

after(async () => {
  await pool.end();
});

test("buildImplicitTenant returns the default implicit tenant context", () => {
  assert.deepEqual(buildImplicitTenant(), {
    id: null,
    tenantCode: DEFAULT_TENANT_CODE,
    tenantName: DEFAULT_TENANT_NAME,
    tenantSlug: DEFAULT_TENANT_CODE,
    status: "enabled",
    isDefault: true,
    source: "implicit"
  });
});

test("extractTenantId reads tenant id from auth context tenant or user", () => {
  assert.equal(extractTenantId({ tenant: { id: "7" } }), 7);
  assert.equal(extractTenantId({ user: { tenantId: "9" } }), 9);
  assert.equal(extractTenantId({ tenant: { id: "bad" } }), null);
  assert.equal(extractTenantId(null), null);
});

test("normalizeTenantIdentifier trims values and converts empty values to null", () => {
  assert.equal(normalizeTenantIdentifier("  default  "), "default");
  assert.equal(normalizeTenantIdentifier(""), null);
  assert.equal(normalizeTenantIdentifier(null), null);
});

test("normalizeTenantRow maps database rows into tenant objects", () => {
  assert.deepEqual(normalizeTenantRow({
    tenantId: "12",
    tenantCode: "alpha",
    tenantName: "Alpha Farm",
    tenantSlug: "alpha-farm",
    tenantStatus: "paused",
    tenantIsDefault: 1
  }), {
    id: 12,
    tenantCode: "alpha",
    tenantName: "Alpha Farm",
    tenantSlug: "alpha-farm",
    status: "paused",
    isDefault: true,
    source: "database"
  });
});

test("normalizeTenantRow falls back to implicit tenant when row is empty", () => {
  assert.deepEqual(normalizeTenantRow(null), buildImplicitTenant());
  assert.deepEqual(normalizeTenantRow({}), buildImplicitTenant());
});
