import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("/vue/") ||
            id.includes("vue-router") ||
            id.includes("/pinia/")
          ) {
            return "framework-vendor";
          }

          if (id.includes("lucide-vue-next")) {
            return "icon-vendor";
          }

          return "vendor";
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  },
  server: {
    port: 5174
  }
});
