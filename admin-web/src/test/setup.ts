import { afterEach } from "vitest";

const storageState: Record<string, string> = {};

const localStorageMock: Storage = {
  get length() {
    return Object.keys(storageState).length;
  },
  clear() {
    Object.keys(storageState).forEach((key) => {
      delete storageState[key];
    });
  },
  getItem(key: string) {
    return Object.prototype.hasOwnProperty.call(storageState, key) ? storageState[key] : null;
  },
  key(index: number) {
    return Object.keys(storageState)[index] ?? null;
  },
  removeItem(key: string) {
    delete storageState[key];
  },
  setItem(key: string, value: string) {
    storageState[key] = String(value);
  }
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme-preset");
  document.documentElement.removeAttribute("style");
});
