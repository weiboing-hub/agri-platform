import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  apiRequest: vi.fn(async () => ({ themePreset: "ocean" }))
}));

vi.mock("./session", () => ({
  hasPermission: vi.fn(() => false),
  loadSession: vi.fn(() => null)
}));

import {
  applyThemePreset,
  getStoredThemePreset,
  syncThemePreference,
  THEME_OPTIONS,
  updateThemePreference
} from "./theme";

describe("theme helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("falls back to forest for invalid presets and persists the resolved key", () => {
    const resolved = applyThemePreset("unknown");
    expect(resolved).toBe("forest");
    expect(document.documentElement.dataset.themePreset).toBe("forest");
    expect(getStoredThemePreset()).toBe("forest");
  });

  it("applies selected preset css variables", () => {
    const resolved = applyThemePreset("ocean");
    expect(resolved).toBe("ocean");
    expect(document.documentElement.style.getPropertyValue("--color-primary-start")).toBe("#23638d");
  });

  it("skips remote persistence when persistRemote is false", async () => {
    const result = await updateThemePreference("amber", { persistRemote: false });
    expect(result).toEqual({
      themePreset: "amber",
      persisted: false
    });
  });

  it("syncs stored theme when no session is present", async () => {
    localStorage.setItem("agri_admin_theme_preset", "berry");
    const result = await syncThemePreference();
    expect(result.themePreset).toBe("berry");
  });

  it("exposes theme options for the picker", () => {
    expect(THEME_OPTIONS.map((item) => item.value)).toContain("forest");
    expect(THEME_OPTIONS.map((item) => item.value)).toContain("ocean");
  });
});
