import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  bodyHasAtlasReferenceAssets,
  ensureAtlasVideoReferenceUrlsInBody,
  isAtlasCloudHostedUrl,
} from './upload-media';

vi.mock('@mxmai/mxmdata', () => ({
  RepositoryFactory: {
    createStorageRepository: vi.fn(),
    createStorageObjectRepository: vi.fn(),
  },
}));

vi.mock('../../task/reference-image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../task/reference-image')>();
  return {
    ...actual,
    downloadReferenceImageBuffer: vi.fn(async (content: string) => ({
      buffer: MINI_PNG,
      contentType: 'image/png',
      filename: 'ref.png',
    })),
  };
});

const MINI_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

vi.mock('../../core/storage/r2-uploader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/storage/r2-uploader')>();
  return {
    ...actual,
    downloadBufferFromR2: vi.fn(async () => ({
      buffer: MINI_PNG,
      contentType: 'image/png',
    })),
  };
});

describe('atlascloud/upload-media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/v1/model/uploadMedia')) {
          return new Response(
            JSON.stringify({
              data: { download_url: 'https://storage.atlascloud.ai/uploads/test/cell.jpg' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('r2.dev')) {
          return new Response(new Uint8Array(MINI_PNG), {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  it('detects atlas hosted urls', () => {
    expect(isAtlasCloudHostedUrl('https://storage.atlascloud.ai/uploads/a.jpg')).toBe(true);
    expect(
      isAtlasCloudHostedUrl(
        'https://atlas-img.oss-accelerate-overseas.aliyuncs.com/images/abc.png',
      ),
    ).toBe(true);
    expect(isAtlasCloudHostedUrl('https://pub-xxx.r2.dev/video-grid/x/0.png')).toBe(false);
  });

  it('bodyHasAtlasReferenceAssets finds reference fields', () => {
    expect(bodyHasAtlasReferenceAssets({ prompt: 'x' })).toBe(false);
    expect(bodyHasAtlasReferenceAssets({ reference_images: ['https://a.jpg'] })).toBe(true);
  });

  it('rewrites non-atlas reference_images via uploadMedia', async () => {
    const body: Record<string, unknown> = {
      reference_images: ['https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/video-grid/task/0.png'],
      input_reference: 'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/video-grid/task/0.png',
    };
    await ensureAtlasVideoReferenceUrlsInBody(body, { apiKey: 'test-key' });
    expect(body.reference_images).toEqual([
      'https://storage.atlascloud.ai/uploads/test/cell.jpg',
    ]);
    expect(body.input_reference).toBe('https://storage.atlascloud.ai/uploads/test/cell.jpg');
    expect(fetch).toHaveBeenCalled();
  });

  it('downloads R2 video-grid via signed GET before uploadMedia', async () => {
    const { downloadBufferFromR2 } = await import('../../core/storage/r2-uploader');
    const body: Record<string, unknown> = {
      reference_images: ['https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/video-grid/t/0.png'],
    };
    await ensureAtlasVideoReferenceUrlsInBody(body, { apiKey: 'test-key' });
    expect(downloadBufferFromR2).toHaveBeenCalledWith('video-grid/t/0.png', expect.any(String));
  });

  it('rewrites gateway public object paths via downloadReferenceImageBuffer', async () => {
    const { downloadReferenceImageBuffer } = await import('../../task/reference-image');
    const body: Record<string, unknown> = {
      input_reference: '/api/v1/media/public/object/ed4e3afd-561b-4ec8-866b-f9c15eba16e0',
    };
    await ensureAtlasVideoReferenceUrlsInBody(body, {
      apiKey: 'test-key',
      userId: 'user-1',
    });
    expect(downloadReferenceImageBuffer).toHaveBeenCalledWith(
      '/api/v1/media/public/object/ed4e3afd-561b-4ec8-866b-f9c15eba16e0',
      'user-1',
    );
    expect(body.input_reference).toBe('https://storage.atlascloud.ai/uploads/test/cell.jpg');
  });
});
