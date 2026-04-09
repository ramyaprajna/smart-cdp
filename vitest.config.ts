import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "test/**/*.{test,spec}.{ts,tsx}",
      "dev/tests/**/*.{test,spec}.{ts,tsx}",
      "development/testing/tests/**/*.{test,spec}.{ts,tsx}",
    ],
    setupFiles: [
      "./dev/tests/setup.ts",
      "./development/testing/tests/setup.ts",
    ],
    testTimeout: 50000,
    hookTimeout: 50000,
    environmentOptions: {
      jsdom: {
        url: "http://localhost:5000",
      },
    },
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      reporter: [
        "text",
        "json",
        "html",
        ["lcov", { projectRoot: path.resolve(__dirname) }],
      ],
      reportsDirectory: "./coverage",
      include: ["client/src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
      exclude: [
        "node_modules/",
        "test/",
        "dev/tests/",
        "development/testing/tests/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/dist/**",
        "**/build/**",
        "server/vite.ts",
        "vite.config.ts",
      ],
      all: true,
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 10,
        statements: 10,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
      "@server": path.resolve(__dirname, "./server"),
    },
  },
});
