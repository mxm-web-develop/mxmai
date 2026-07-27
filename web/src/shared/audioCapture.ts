type LegacyNavigator = Navigator & {
  getUserMedia?: (
    constraints: MediaStreamConstraints,
    success: (stream: MediaStream) => void,
    error: (err: Error) => void,
  ) => void;
  webkitGetUserMedia?: LegacyNavigator['getUserMedia'];
  mozGetUserMedia?: LegacyNavigator['getUserMedia'];
};

export function isSecureMediaContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

/** 是否可尝试麦克风录制（HTTPS / localhost + API 可用） */
export function canUseMicrophoneCapture(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (navigator.mediaDevices?.getUserMedia) return true;
  const nav = navigator as LegacyNavigator;
  return Boolean(nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia);
}

export function microphoneUnavailableReason(): string | null {
  if (canUseMicrophoneCapture()) return null;
  if (!isSecureMediaContext()) {
    return '麦克风需在 HTTPS 或 localhost 下使用，请改用「上传音频」，或为站点启用 HTTPS';
  }
  return '当前浏览器不支持麦克风录制，请改用「上传音频」';
}

export async function captureMicrophoneStream(): Promise<MediaStream> {
  const blocked = microphoneUnavailableReason();
  if (blocked) {
    throw new Error(blocked);
  }

  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }

  const nav = navigator as LegacyNavigator;
  const legacy = nav.getUserMedia ?? nav.webkitGetUserMedia ?? nav.mozGetUserMedia;
  if (!legacy) {
    throw new Error('无法访问麦克风 API');
  }

  return new Promise<MediaStream>((resolve, reject) => {
    legacy.call(nav, { audio: true }, resolve, (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

export function pickMediaRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

export function isMediaRecorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && Boolean(pickMediaRecorderMimeType());
}
