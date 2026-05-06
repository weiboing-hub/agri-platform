import type { FlatModule, ModulePriority } from "../config/modules";

const RECENT_NAVIGATION_STORAGE_KEY = "agri_admin_recent_navigation";
const FAVORITE_NAVIGATION_STORAGE_KEY = "agri_admin_favorite_navigation";
const MAX_RECENT_ENTRIES = 6;
const MAX_FAVORITE_ENTRIES = 8;

export interface RecentNavigationItem {
  path: string;
  title: string;
  groupTitle: string;
  domainTitle: string;
  recordedAt: number;
}

export interface FavoriteNavigationItem {
  path: string;
  title: string;
  groupTitle: string;
  domainTitle: string;
  priority: ModulePriority;
}

export type NavigationModuleLike = Pick<FlatModule, "path" | "title" | "groupTitle" | "domainTitle" | "priority"> | null | undefined;

export function loadRecentNavigation(): RecentNavigationItem[] {
  try {
    const raw = localStorage.getItem(RECENT_NAVIGATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentNavigationItem[]) : [];
  } catch {
    return [];
  }
}

function saveRecentNavigation(items: RecentNavigationItem[]): void {
  try {
    localStorage.setItem(RECENT_NAVIGATION_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore localStorage write failures.
  }
}

export function rememberRecentModule(module: NavigationModuleLike): RecentNavigationItem[] {
  if (!module?.path || !module?.title) {
    return loadRecentNavigation();
  }

  const nextItems = [
    {
      path: module.path,
      title: module.title,
      groupTitle: module.groupTitle || "",
      domainTitle: module.domainTitle || "",
      recordedAt: Date.now()
    },
    ...loadRecentNavigation().filter((item) => item.path !== module.path)
  ].slice(0, MAX_RECENT_ENTRIES);

  saveRecentNavigation(nextItems);
  return nextItems;
}

export function loadFavoriteNavigation(): FavoriteNavigationItem[] {
  try {
    const raw = localStorage.getItem(FAVORITE_NAVIGATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as FavoriteNavigationItem[]) : [];
  } catch {
    return [];
  }
}

function saveFavoriteNavigation(items: FavoriteNavigationItem[]): void {
  try {
    localStorage.setItem(FAVORITE_NAVIGATION_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore localStorage write failures.
  }
}

export function isFavoritePath(path: string): boolean {
  return loadFavoriteNavigation().some((item) => item.path === path);
}

export function toggleFavoriteModule(module: NavigationModuleLike): FavoriteNavigationItem[] {
  if (!module?.path || !module?.title) {
    return loadFavoriteNavigation();
  }

  const currentItems = loadFavoriteNavigation();
  const exists = currentItems.some((item) => item.path === module.path);

  const nextItems = exists
    ? currentItems.filter((item) => item.path !== module.path)
    : [
        {
          path: module.path,
          title: module.title,
          groupTitle: module.groupTitle || "",
          domainTitle: module.domainTitle || "",
          priority: module.priority || "P1"
        },
        ...currentItems
      ].slice(0, MAX_FAVORITE_ENTRIES);

  saveFavoriteNavigation(nextItems);
  return nextItems;
}
