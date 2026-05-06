import { apiRequest } from "./api";
import { hasPermission, loadSession } from "./session";

const STORAGE_KEY = "agri_admin_theme_preset";
export const THEME_CHANGE_EVENT = "agri-theme-change";

type ThemeCssMap = Record<string, string>;

interface ThemePreset {
  name: string;
  css: ThemeCssMap;
}

interface ThemePreferenceOptions {
  persistRemote?: boolean;
}

interface ThemeSyncResponse {
  themePreset?: string;
  [key: string]: unknown;
}

export const THEME_PRESETS = {
  forest: {
    name: "森林绿",
    css: {
      "--color-bg-radial": "rgba(110, 166, 120, 0.14)",
      "--color-bg-top": "#f6faf5",
      "--color-bg-bottom": "#edf3ee",
      "--color-sidebar-start": "#1e3b2b",
      "--color-sidebar-end": "#274c37",
      "--color-primary-start": "#2f6b42",
      "--color-primary-end": "#49855d",
      "--color-ghost-bg": "rgba(41, 80, 54, 0.08)",
      "--color-ghost-text": "#2d5639",
      "--color-link": "#2c6a42",
      "--color-note-border": "rgba(46, 93, 58, 0.12)",
      "--color-note-text": "#355c3e",
      "--color-subtitle": "#59715d",
      "--color-panel-bg": "rgba(255, 255, 255, 0.86)",
      "--color-panel-border": "rgba(43, 80, 52, 0.08)",
      "--color-input-border": "rgba(43, 80, 52, 0.15)",
      "--color-input-bg": "rgba(255, 255, 255, 0.98)",
      "--color-surface": "#f8fbf8",
      "--color-surface-border": "rgba(69, 108, 79, 0.08)",
      "--color-surface-muted": "#eef4ef",
      "--color-surface-elevated": "#f4f8f5",
      "--color-accent-soft": "rgba(47, 107, 66, 0.12)",
      "--color-accent-medium": "rgba(47, 107, 66, 0.18)",
      "--color-accent-strong": "rgba(47, 107, 66, 0.28)",
      "--color-dark-surface": "#1f2a24",
      "--color-dark-surface-text": "#eef6ef"
    }
  },
  ocean: {
    name: "海岸蓝",
    css: {
      "--color-bg-radial": "rgba(61, 137, 201, 0.16)",
      "--color-bg-top": "#f4f9fd",
      "--color-bg-bottom": "#eaf2f8",
      "--color-sidebar-start": "#173a54",
      "--color-sidebar-end": "#245877",
      "--color-primary-start": "#23638d",
      "--color-primary-end": "#3d88bb",
      "--color-ghost-bg": "rgba(35, 99, 141, 0.09)",
      "--color-ghost-text": "#245877",
      "--color-link": "#23638d",
      "--color-note-border": "rgba(42, 94, 132, 0.14)",
      "--color-note-text": "#245877",
      "--color-subtitle": "#547186",
      "--color-panel-bg": "rgba(251, 253, 255, 0.9)",
      "--color-panel-border": "rgba(44, 98, 133, 0.1)",
      "--color-input-border": "rgba(44, 98, 133, 0.16)",
      "--color-input-bg": "rgba(255, 255, 255, 0.98)",
      "--color-surface": "#f5f9fc",
      "--color-surface-border": "rgba(61, 137, 201, 0.12)",
      "--color-surface-muted": "#edf4f9",
      "--color-surface-elevated": "#f2f8fc",
      "--color-accent-soft": "rgba(35, 99, 141, 0.12)",
      "--color-accent-medium": "rgba(35, 99, 141, 0.18)",
      "--color-accent-strong": "rgba(35, 99, 141, 0.28)",
      "--color-dark-surface": "#1a2b38",
      "--color-dark-surface-text": "#edf6fb"
    }
  },
  amber: {
    name: "麦田橙",
    css: {
      "--color-bg-radial": "rgba(214, 146, 49, 0.16)",
      "--color-bg-top": "#fff9f2",
      "--color-bg-bottom": "#f7efe3",
      "--color-sidebar-start": "#4a3517",
      "--color-sidebar-end": "#6a4a1d",
      "--color-primary-start": "#b36a1b",
      "--color-primary-end": "#d38c2f",
      "--color-ghost-bg": "rgba(179, 106, 27, 0.1)",
      "--color-ghost-text": "#8c5618",
      "--color-link": "#b36a1b",
      "--color-note-border": "rgba(134, 91, 30, 0.14)",
      "--color-note-text": "#85591e",
      "--color-subtitle": "#86684b",
      "--color-panel-bg": "rgba(255, 251, 246, 0.9)",
      "--color-panel-border": "rgba(134, 91, 30, 0.1)",
      "--color-input-border": "rgba(134, 91, 30, 0.16)",
      "--color-input-bg": "rgba(255, 255, 255, 0.98)",
      "--color-surface": "#fcf7ef",
      "--color-surface-border": "rgba(179, 106, 27, 0.12)",
      "--color-surface-muted": "#f7efe1",
      "--color-surface-elevated": "#fbf4ea",
      "--color-accent-soft": "rgba(179, 106, 27, 0.12)",
      "--color-accent-medium": "rgba(179, 106, 27, 0.18)",
      "--color-accent-strong": "rgba(179, 106, 27, 0.28)",
      "--color-dark-surface": "#2f2417",
      "--color-dark-surface-text": "#faf1e2"
    }
  },
  berry: {
    name: "浆果红",
    css: {
      "--color-bg-radial": "rgba(186, 86, 104, 0.16)",
      "--color-bg-top": "#fdf6f7",
      "--color-bg-bottom": "#f5ebee",
      "--color-sidebar-start": "#4d2030",
      "--color-sidebar-end": "#6d3046",
      "--color-primary-start": "#9e3954",
      "--color-primary-end": "#c15472",
      "--color-ghost-bg": "rgba(158, 57, 84, 0.09)",
      "--color-ghost-text": "#7b2f43",
      "--color-link": "#9e3954",
      "--color-note-border": "rgba(132, 56, 77, 0.14)",
      "--color-note-text": "#7b2f43",
      "--color-subtitle": "#7f5a66",
      "--color-panel-bg": "rgba(254, 249, 250, 0.9)",
      "--color-panel-border": "rgba(132, 56, 77, 0.1)",
      "--color-input-border": "rgba(132, 56, 77, 0.16)",
      "--color-input-bg": "rgba(255, 255, 255, 0.98)",
      "--color-surface": "#fbf6f8",
      "--color-surface-border": "rgba(158, 57, 84, 0.12)",
      "--color-surface-muted": "#f5edf0",
      "--color-surface-elevated": "#faf2f5",
      "--color-accent-soft": "rgba(158, 57, 84, 0.12)",
      "--color-accent-medium": "rgba(158, 57, 84, 0.18)",
      "--color-accent-strong": "rgba(158, 57, 84, 0.28)",
      "--color-dark-surface": "#311f26",
      "--color-dark-surface-text": "#fdf2f5"
    }
  },
  slate: {
    name: "岩板灰",
    css: {
      "--color-bg-radial": "rgba(103, 117, 136, 0.16)",
      "--color-bg-top": "#f6f8fb",
      "--color-bg-bottom": "#edf1f5",
      "--color-sidebar-start": "#293746",
      "--color-sidebar-end": "#394c61",
      "--color-primary-start": "#496179",
      "--color-primary-end": "#627d96",
      "--color-ghost-bg": "rgba(73, 97, 121, 0.09)",
      "--color-ghost-text": "#415668",
      "--color-link": "#496179",
      "--color-note-border": "rgba(73, 97, 121, 0.14)",
      "--color-note-text": "#415668",
      "--color-subtitle": "#62707f",
      "--color-panel-bg": "rgba(250, 252, 254, 0.9)",
      "--color-panel-border": "rgba(73, 97, 121, 0.1)",
      "--color-input-border": "rgba(73, 97, 121, 0.16)",
      "--color-input-bg": "rgba(255, 255, 255, 0.98)",
      "--color-surface": "#f5f8fb",
      "--color-surface-border": "rgba(73, 97, 121, 0.12)",
      "--color-surface-muted": "#edf2f6",
      "--color-surface-elevated": "#f2f6fa",
      "--color-accent-soft": "rgba(73, 97, 121, 0.12)",
      "--color-accent-medium": "rgba(73, 97, 121, 0.18)",
      "--color-accent-strong": "rgba(73, 97, 121, 0.28)",
      "--color-dark-surface": "#1f2831",
      "--color-dark-surface-text": "#eef4f9"
    }
  }
} as const satisfies Record<string, ThemePreset>;

export type ThemePresetKey = keyof typeof THEME_PRESETS;

export const THEME_OPTIONS = Object.entries(THEME_PRESETS).map(([value, preset]) => ({
  value,
  label: preset.name
}));

export function getStoredThemePreset(): ThemePresetKey {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && stored in THEME_PRESETS ? (stored as ThemePresetKey) : "forest";
  } catch {
    return "forest";
  }
}

export function applyThemePreset(themePreset: string = "forest"): ThemePresetKey {
  const resolvedKey = themePreset in THEME_PRESETS ? (themePreset as ThemePresetKey) : "forest";
  const root = document.documentElement;
  const cssVars = THEME_PRESETS[resolvedKey].css;

  Object.entries(cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  root.dataset.themePreset = resolvedKey;

  try {
    localStorage.setItem(STORAGE_KEY, resolvedKey);
  } catch {
    // ignore localStorage write failures
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return resolvedKey;
}

export function applyStoredThemePreset(): ThemePresetKey {
  return applyThemePreset(getStoredThemePreset());
}

export async function updateThemePreference(
  themePreset: string,
  options: ThemePreferenceOptions = {}
) {
  const { persistRemote = true } = options;
  const resolvedPreset = applyThemePreset(themePreset);

  if (!persistRemote) {
    return { themePreset: resolvedPreset, persisted: false };
  }

  const session = loadSession();
  if (!session?.accessToken || !hasPermission("system:config", session)) {
    return { themePreset: resolvedPreset, persisted: false };
  }

  try {
    await apiRequest("/api/v1/system/configs", {
      method: "PUT",
      body: JSON.stringify({
        items: [
          {
            configGroup: "appearance",
            configKey: "theme_preset",
            configName: "主题颜色",
            configValueJson: resolvedPreset,
            description: "控制整个后台的主视觉颜色。"
          }
        ]
      })
    });
    return { themePreset: resolvedPreset, persisted: true };
  } catch (error) {
    console.error("[theme-save-failed]", error);
    return { themePreset: resolvedPreset, persisted: false, error };
  }
}

export async function syncThemePreference() {
  if (!loadSession()?.accessToken) {
    return { themePreset: applyStoredThemePreset() };
  }

  try {
    const result = await apiRequest<ThemeSyncResponse>("/api/v1/system/theme");
    return {
      ...result,
      themePreset: applyThemePreset(result.themePreset)
    };
  } catch (error) {
    console.error("[theme-sync-failed]", error);
    return { themePreset: applyStoredThemePreset() };
  }
}
