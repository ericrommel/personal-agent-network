import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        "src/modules/audit/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/modules/permissions/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/modules/context/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/modules/messaging/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/modules/skills/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/modules/policy/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/modules/relationships/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/modules/discovery/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/modules/identity/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/modules/approval/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/runtime/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/shared/domain/identity-ids.ts": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    include: ["tests/**/*.test.ts"],
  },
});
