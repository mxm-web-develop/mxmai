import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.ts',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/__mocks__/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@mxmai/mxmdata': path.resolve(__dirname, './mxmdata/src'),
      '@mxmai/mxm-editor-core': path.resolve(__dirname, './mxm-editor-core/src'),
      '@mxmai/mxm-editor-core/types/timeline': path.resolve(__dirname, './mxm-editor-core/src/types/timeline'),
      '@mxmai/mxm-editor-core/types/project': path.resolve(__dirname, './mxm-editor-core/src/types/project'),
      '@mxmai/mxm-editor-core/types/effects': path.resolve(__dirname, './mxm-editor-core/src/types/effects'),
      '@mxmai/mxm-editor-core/types/transform-3d': path.resolve(__dirname, './mxm-editor-core/src/types/transform-3d'),
      '@mxmai/mxm-editor-core/types/transitions': path.resolve(__dirname, './mxm-editor-core/src/types/transitions'),
      '@mxmai/mxm-editor-core/types/composition': path.resolve(__dirname, './mxm-editor-core/src/types/composition'),
      '@mxmai/mxm-editor-core/types/actions': path.resolve(__dirname, './mxm-editor-core/src/types/actions'),
      '@mxmai/mxm-editor-core/types/lottie': path.resolve(__dirname, './mxm-editor-core/src/types/lottie'),
      '@mxmai/mxm-editor-core/types/template': path.resolve(__dirname, './mxm-editor-core/src/types/template'),
      '@mxmai/mxm-editor-core/utils/serialization': path.resolve(__dirname, './mxm-editor-core/src/utils/serialization'),
      '@mxmai/mxm-editor-core/utils/immutable-updates': path.resolve(__dirname, './mxm-editor-core/src/utils/immutable-updates'),
      '@mxmai/mxm-editor-core/storage/types': path.resolve(__dirname, './mxm-editor-core/src/storage/types'),
      '@mxmai/mxm-editor-core/storage/project-serializer': path.resolve(__dirname, './mxm-editor-core/src/storage/project-serializer'),
      '@mxmai/mxm-editor-core/storage/schema-types': path.resolve(__dirname, './mxm-editor-core/src/storage/schema-types'),
      '@mxmai/mxm-editor-core/storage/storage-engine': path.resolve(__dirname, './mxm-editor-core/src/storage/storage-engine'),
      '@mxmai/mxm-editor-core/actions': path.resolve(__dirname, './mxm-editor-core/src/actions'),
      '@mxmai/mxm-editor-core/timeline': path.resolve(__dirname, './mxm-editor-core/src/timeline'),
      '@mxmai/mxm-editor-core/media/media-import-service': path.resolve(__dirname, './mxm-editor-core/src/media/media-import-service'),
      '@mxmai/mxm-editor-core/effects': path.resolve(__dirname, './mxm-editor-core/src/effects'),
      '@mxmai/mxm-editor-core/ai': path.resolve(__dirname, './mxm-editor-core/src/ai'),
      '@mxmai/mxm-editor-core/device': path.resolve(__dirname, './mxm-editor-core/src/device'),
      '@mxmai/mxm-editor-core/animation': path.resolve(__dirname, './mxm-editor-core/src/animation'),
      '@mxmai/mxm-editor-core/text': path.resolve(__dirname, './mxm-editor-core/src/text'),
      '@mxmai/mxm-editor-core/graphics': path.resolve(__dirname, './mxm-editor-core/src/graphics'),
      '@mxmai/mxm-editor-core/template': path.resolve(__dirname, './mxm-editor-core/src/template'),
      '@mxmai/mxm-editor-core/editing-templates': path.resolve(__dirname, './mxm-editor-core/src/editing-templates'),
      '@mxmai/mxm-editor-core/photo': path.resolve(__dirname, './mxm-editor-core/src/photo'),
      '@aws-sdk/client-s3': path.resolve(__dirname, './mxmcgi/node_modules/@aws-sdk/client-s3'),
    },
  },
});

