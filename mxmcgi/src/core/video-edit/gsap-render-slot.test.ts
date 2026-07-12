import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireGsapRenderSlot,
  gsapRenderActiveCount,
  gsapRenderQueueLength,
  parseGsapRenderMaxConcurrent,
  releaseGsapRenderSlot,
  withGsapRenderSlot,
} from './gsap-render-slot';

async function drainAllSlots(): Promise<void> {
  for (let i = 0; i < 32; i++) {
    if (gsapRenderActiveCount() === 0 && gsapRenderQueueLength() === 0) return;
    releaseGsapRenderSlot();
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('gsap-render-slot', () => {
  afterEach(async () => {
    delete process.env.GSAP_RENDER_MAX_CONCURRENT;
    await drainAllSlots();
  });

  it('defaults max concurrent to 1', () => {
    delete process.env.GSAP_RENDER_MAX_CONCURRENT;
    expect(parseGsapRenderMaxConcurrent()).toBe(1);
  });

  it('respects GSAP_RENDER_MAX_CONCURRENT env', () => {
    process.env.GSAP_RENDER_MAX_CONCURRENT = '2';
    expect(parseGsapRenderMaxConcurrent()).toBe(2);
  });

  it('queues extra acquires when at capacity', async () => {
    process.env.GSAP_RENDER_MAX_CONCURRENT = '1';
    await acquireGsapRenderSlot();
    expect(gsapRenderActiveCount()).toBe(1);

    let secondStarted = false;
    const second = acquireGsapRenderSlot().then(() => {
      secondStarted = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(gsapRenderQueueLength()).toBe(1);
    expect(secondStarted).toBe(false);

    releaseGsapRenderSlot();
    await second;
    expect(secondStarted).toBe(true);
    releaseGsapRenderSlot();
  });

  it('withGsapRenderSlot releases on success and failure', async () => {
    process.env.GSAP_RENDER_MAX_CONCURRENT = '1';
    await withGsapRenderSlot(async () => 'ok');
    expect(gsapRenderActiveCount()).toBe(0);

    await expect(
      withGsapRenderSlot(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(gsapRenderActiveCount()).toBe(0);
  });

  it('allows limited parallel slots', async () => {
    process.env.GSAP_RENDER_MAX_CONCURRENT = '2';
    await acquireGsapRenderSlot();
    await acquireGsapRenderSlot();
    expect(gsapRenderActiveCount()).toBe(2);

    let thirdStarted = false;
    void acquireGsapRenderSlot().then(() => {
      thirdStarted = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(gsapRenderQueueLength()).toBe(1);
    expect(thirdStarted).toBe(false);

    releaseGsapRenderSlot();
    await new Promise((r) => setTimeout(r, 5));
    expect(thirdStarted).toBe(true);
    releaseGsapRenderSlot();
    releaseGsapRenderSlot();
  });
});
