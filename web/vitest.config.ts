import { defineConfig } from 'vitest/config';
import path from 'path';

// Test-only config: lets Vitest resolve the `@/` path alias and compile JSX in
// .tsx test files. Runtime (Next.js) builds are untouched. Tests default to the
// node environment; component tests opt into jsdom via a
// `// @vitest-environment jsdom` docblock.
export default defineConfig({
    esbuild: { jsx: 'automatic' },
    resolve: {
        alias: { '@': path.resolve(__dirname) },
    },
    test: {
        environment: 'node',
    },
});
