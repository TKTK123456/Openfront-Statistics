import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: "src",

  resolve: {
    alias: {
      src: path.resolve(__dirname, "src"),
      resources: path.resolve(__dirname, "OpenFrontIO/resources"),
    },
  },

  server: {
    middlewareMode: true,
  },

  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});