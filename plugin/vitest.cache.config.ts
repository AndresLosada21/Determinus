import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/cache-*.test.ts", "scripts/install.test.ts"],
    testTimeout: 10000,
  },
});
