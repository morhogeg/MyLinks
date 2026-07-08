import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Mirror the tsconfig path alias ("@/*" -> "./*") so tests import lib modules
// exactly as the app does (source.ts itself imports from "@/lib/platform").
export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['lib/**/*.test.ts', 'tests/**/*.test.ts'],
    },
});
