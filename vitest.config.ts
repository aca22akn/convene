import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/integration/**", "tests/integration-upgrade/**"],
    environment: "node",
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
