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
      // We intentionally use plain <img>: this app is a static export (no Next
      // image optimization server) and renders remote thumbnails from arbitrary
      // hosts, which next/image can't handle without a custom loader.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
