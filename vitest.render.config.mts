import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        include: ['src/test/vitest/render/**/*.test.tsx'],
        setupFiles: [
            'src/test/vitest/setup.ts',
            'src/test/vitest/setup-dom.ts',
        ],
        restoreMocks: true,
        clearMocks: true,
    },
});
