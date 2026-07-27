/** 从视频 Blob URL 截取首帧，生成 JPEG blob URL 供列表封面使用 */
export function captureVideoPosterBlobUrl(videoSrc: string, seekSec = 0.05): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const cleanup = () => {
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };

    const drawFrame = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          finish(() => {
            cleanup();
            reject(new Error('empty video dimensions'));
          });
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(() => {
            cleanup();
            reject(new Error('canvas unavailable'));
          });
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            finish(() => {
              cleanup();
              if (!blob) {
                reject(new Error('empty poster blob'));
                return;
              }
              resolve(URL.createObjectURL(blob));
            });
          },
          'image/jpeg',
          0.82
        );
      } catch (error) {
        finish(() => {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      }
    };

    video.onloadeddata = () => {
      try {
        if (video.duration && seekSec < video.duration) {
          video.currentTime = seekSec;
        } else {
          drawFrame();
        }
      } catch {
        drawFrame();
      }
    };
    video.onseeked = drawFrame;
    video.onerror = () => {
      finish(() => {
        cleanup();
        reject(new Error('video load failed'));
      });
    };

    video.src = videoSrc;
  });
}
