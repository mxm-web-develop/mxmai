import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import SliderCaptcha, { type ActionType } from 'rc-slider-captcha';
import { getCaptcha, verifyCaptchaSlide } from '../api/client';
import type { CaptchaValues } from './CaptchaField';

export type SliderCaptchaCoreProps = {
  active?: boolean;
  refreshKey?: number;
  className?: string;
  onVerified: (values: CaptchaValues) => void;
  onError?: (message: string) => void;
};

export function SliderCaptchaCore({
  active = true,
  refreshKey = 0,
  className = 'mxm-slider-captcha',
  onVerified,
  onError,
}: SliderCaptchaCoreProps) {
  const { t } = useTranslation();
  const actionRef = useRef<ActionType>();
  const captchaIdRef = useRef('');

  const requestCaptcha = useCallback(async () => {
    const res = await getCaptcha();
    if ('error' in res && res.error) {
      onError?.(res.error);
      throw new Error(res.error);
    }
    captchaIdRef.current = res.captchaId;
    return {
      bgUrl: res.bgUrl,
      puzzleUrl: res.puzzleUrl,
    };
  }, [onError]);

  const handleVerify = useCallback(
    async (data: {
      x: number;
      y: number;
      duration: number;
      trail: [number, number][];
    }) => {
      const currentId = captchaIdRef.current;
      if (!currentId) {
        return Promise.reject(new Error('missing captcha'));
      }

      const res = await verifyCaptchaSlide(currentId, {
        x: data.x,
        duration: data.duration,
        trail: data.trail,
      });

      if (!res.success) {
        onError?.(res.error || t('landing.captchaVerifyFailed'));
        return Promise.reject(new Error(res.error || 'verify failed'));
      }

      onVerified({ captchaId: currentId, captchaAnswer: 'verified' });
      return Promise.resolve();
    },
    [onError, onVerified, t]
  );

  useEffect(() => {
    if (!active) return;
    captchaIdRef.current = '';
    actionRef.current?.refresh(true);
  }, [active, refreshKey]);

  if (!active) return null;

  return (
    <SliderCaptcha
      actionRef={actionRef}
      request={requestCaptcha}
      onVerify={handleVerify}
      bgSize={{ width: 320, height: 160 }}
      puzzleSize={{ width: 50, height: 50, left: 0, top: 75 }}
      autoRefreshOnError
      limitErrorCount={3}
      className={className}
      style={{
        '--rcsc-primary': '#0369a1',
        '--rcsc-primary-light': '#e0f2fe',
        '--rcsc-success': '#059669',
        '--rcsc-success-light': '#d1fae5',
        '--rcsc-error': '#dc2626',
        '--rcsc-error-light': '#fee2e2',
        '--rcsc-border-color': '#e2e8f0',
        '--rcsc-bg-color': '#ffffff',
        '--rcsc-text-color': '#475569',
        '--rcsc-button-color': '#94a3b8',
        '--rcsc-button-hover-color': '#0369a1',
        '--rcsc-button-bg-color': '#f8fafc',
        '--rcsc-panel-border-radius': '12px',
        '--rcsc-control-border-radius': '10px',
        '--rcsc-control-height': '44px',
      }}
      tipText={{
        default: t('landing.captchaSlideDefault'),
        loading: t('landing.captchaLoading'),
        loadFailed: t('landing.captchaLoadFailed'),
        success: t('landing.captchaVerified'),
      }}
    />
  );
}
