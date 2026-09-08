import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Existing MongoDB/API payloads are intentionally dynamic. Keep these
      // visible in CI while allowing the current application to ship.
      "@typescript-eslint/no-explicit-any": "warn",
      // Existing client pages trigger their initial fetch from an effect.
      // Keep the migration recommendation visible without blocking deploys.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
