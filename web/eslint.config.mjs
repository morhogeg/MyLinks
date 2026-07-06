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
    // Project conventions. The hardcoded-color rule is an "error": the sweep
    // landed (every raw white/black utility now goes through theme tokens,
    // incl. the theme-invariant white-fixed/black-fixed pair in globals.css),
    // so any new violation is fresh debt. no-console stays "warn" while stray
    // console.log calls are paid down.
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Allow console.warn / console.error; flag stray console.log left in the
      // shipped bundle.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Theme-token rule (CLAUDE.md): never hardcode raw Tailwind colors — use
      // the token system (text-text, bg-card, --accent-gradient, …). This
      // catches the common raw utilities in className strings.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/(?:^|\\s)(?:text|bg|border|ring|from|to|via|fill|stroke)-(?:white|black)(?:\\/\\d+)?(?:\\s|$)/]",
          message:
            "Use theme tokens (text-text, bg-card, border-border-subtle, --accent-gradient) instead of hardcoded white/black color utilities.",
        },
      ],
    },
  },
]);

export default eslintConfig;
