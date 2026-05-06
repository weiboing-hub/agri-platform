import { describe, expect, it } from "vitest";

import type { NavigationModuleLike } from "./navigation";
import {
  isFavoritePath,
  loadFavoriteNavigation,
  loadRecentNavigation,
  rememberRecentModule,
  toggleFavoriteModule
} from "./navigation";

const moduleA: NonNullable<NavigationModuleLike> = {
  path: "/devices/cameras",
  title: "摄像头管理",
  groupTitle: "摄像头与抓图",
  domainTitle: "现场设备",
  priority: "P1"
};

const moduleB: NonNullable<NavigationModuleLike> = {
  path: "/alerts/center",
  title: "告警中心",
  groupTitle: "规则与告警",
  domainTitle: "智能与告警",
  priority: "P0"
};

describe("navigation storage helpers", () => {
  it("stores recent modules in reverse chronological order without duplicates", () => {
    rememberRecentModule(moduleA);
    rememberRecentModule(moduleB);
    rememberRecentModule(moduleA);

    const items = loadRecentNavigation();
    expect(items).toHaveLength(2);
    expect(items[0]?.path).toBe(moduleA.path);
    expect(items[1]?.path).toBe(moduleB.path);
  });

  it("toggles favorite modules and reports favorite state", () => {
    expect(loadFavoriteNavigation()).toEqual([]);

    toggleFavoriteModule(moduleA);
    expect(isFavoritePath(moduleA.path)).toBe(true);
    expect(loadFavoriteNavigation()).toHaveLength(1);

    toggleFavoriteModule(moduleA);
    expect(isFavoritePath(moduleA.path)).toBe(false);
    expect(loadFavoriteNavigation()).toEqual([]);
  });

  it("caps favorites and keeps metadata", () => {
    toggleFavoriteModule(moduleA);
    toggleFavoriteModule(moduleB);

    const items = loadFavoriteNavigation();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      path: moduleB.path,
      title: moduleB.title,
      groupTitle: moduleB.groupTitle,
      domainTitle: moduleB.domainTitle,
      priority: moduleB.priority
    });
  });
});
