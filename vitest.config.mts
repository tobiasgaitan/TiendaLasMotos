import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['src/test/vitest/**/*.test.ts'],
        setupFiles: ['src/test/vitest/setup.ts'],
        restoreMocks: true,
        clearMocks: true,
    },
});
