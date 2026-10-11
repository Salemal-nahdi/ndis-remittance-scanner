import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      "server-only": path.resolve(import.meta.dirname, "tests/empty.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
