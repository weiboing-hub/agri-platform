const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseInteger,
  parseDecimal,
  normalizeEnabled,
  requiredString,
  optionalString,
  mapRowsByKey
} = require("../src/lib/helpers");

test("parseInteger handles valid and fallback values", () => {
  assert.equal(parseInteger("12"), 12);
  assert.equal(parseInteger("12.8"), 12);
  assert.equal(parseInteger("", 7), 7);
  assert.equal(parseInteger("abc", 9), 9);
});

test("parseDecimal handles valid and fallback values", () => {
  assert.equal(parseDecimal("12.5"), 12.5);
  assert.equal(parseDecimal("3"), 3);
  assert.equal(parseDecimal("", 1.2), 1.2);
  assert.equal(parseDecimal("abc", 2.5), 2.5);
});

test("normalizeEnabled normalizes common truthy and falsy forms", () => {
  assert.equal(normalizeEnabled(true, false), true);
  assert.equal(normalizeEnabled("enabled", false), true);
  assert.equal(normalizeEnabled("off", true), false);
  assert.equal(normalizeEnabled("0", true), false);
  assert.equal(normalizeEnabled("unknown", true), true);
});

test("requiredString and optionalString normalize input text", () => {
  assert.equal(requiredString("  sensor-001  ", "编号"), "sensor-001");
  assert.equal(optionalString("  soil  "), "soil");
  assert.equal(optionalString("   "), null);
  assert.throws(() => requiredString("", "编号"), /不能为空/);
});

test("mapRowsByKey creates row lookup maps", () => {
  const rows = [
    { id: 1, code: "A" },
    { id: 2, code: "B" }
  ];
  assert.deepEqual(mapRowsByKey(rows, "id"), {
    1: { id: 1, code: "A" },
    2: { id: 2, code: "B" }
  });
});
