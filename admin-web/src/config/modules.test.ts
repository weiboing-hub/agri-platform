import { describe, expect, it } from "vitest";

import {
  canAccessModule,
  findDomainByPath,
  findModuleByPath,
  getFirstAccessiblePath,
  getPreferredDomainCode,
  getVisibleNavigationDomains
} from "./modules";

describe("modules config", () => {
  it("finds modules by route path", () => {
    const module = findModuleByPath("/devices/cameras");
    expect(module?.code).toBe("cameras");
    expect(module?.domainCode).toBe("field");
  });

  it("checks permissions before exposing modules", () => {
    const module = findModuleByPath("/system/tenants");
    expect(canAccessModule(module, ["tenant:manage"])).toBe(true);
    expect(canAccessModule(module, ["dashboard:view"])).toBe(false);
  });

  it("resolves preferred domain by granted permissions", () => {
    expect(getPreferredDomainCode(["system:config"])).toBe("platform");
    expect(getPreferredDomainCode(["monitor:view"])).toBe("operations");
    expect(getPreferredDomainCode(["device:view"])).toBe("field");
    expect(getPreferredDomainCode(["alert:view"])).toBe("intelligence_ops");
  });

  it("returns first accessible path for a preferred visible domain", () => {
    expect(getFirstAccessiblePath(["dashboard:view"])).toBe("/dashboard/overview");
    expect(getFirstAccessiblePath(["device:view"])).toBe("/devices/areas");
    expect(getFirstAccessiblePath(["tenant:manage"])).toBe("/system/tenants");
  });

  it("returns only visible domains for current permission set", () => {
    const domains = getVisibleNavigationDomains(["dashboard:view", "history:view"]);
    expect(domains.map((item) => item.code)).toEqual(["operations", "field"]);
    expect(domains[0]?.targetPath).toBe("/dashboard/overview");
  });

  it("falls back to the first visible domain for unknown paths", () => {
    const domain = findDomainByPath("/missing", ["monitor:view"]);
    expect(domain?.code).toBe("operations");
  });
});
