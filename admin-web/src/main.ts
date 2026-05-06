import type { ComponentPublicInstance } from "vue";
import { createApp } from "vue";

import App from "./App.vue";
import router from "./router";
import { applyStoredThemePreset } from "./lib/theme";
import { pinia } from "./stores/pinia";
import "./style.css";

applyStoredThemePreset();

const app = createApp(App);

app.config.errorHandler = (error: unknown, instance: ComponentPublicInstance | null, info: string) => {
  console.error("[vue-error]", info, error, instance);
};

window.addEventListener("unhandledrejection", (event) => {
  console.error("[unhandled-rejection]", event.reason);
});

app.use(pinia);
app.use(router);
app.mount("#app");
