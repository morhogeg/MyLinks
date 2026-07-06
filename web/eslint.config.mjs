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
    // Project conventions. Kept at "warn" (not "error") so the existing debt —
    // ~180 hardcoded color utilities and stray console.log calls — surfaces in
    // review without hard-failing CI while it's paid down. Flip to "error" once
    // the backlog sweep (SOURCE_OF_TRUTH §4) lands.
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Allow console.warn / console.error; flag stray console.log left in the
      // shipped bundle.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Theme-token rule (CLAUDE.md): never hardcode raw Tailwind colors — use
      // the token system (text-text, bg-card, --accent-gradient, …). This
      // catches the common raw utilities in className strings.
      "no-restricted-syntax": [
        "warn",
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
