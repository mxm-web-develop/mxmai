import { useCallback, useEffect, useRef, useState } from 'react';
import { getCaptchaConfig, login } from '../api/client';
import type { CaptchaValues } from '../components/CaptchaField';

type LoginSuccess = {
  ok: true;
  accessToken: string;
  user?: unknown;
};

type MfaRequired = {
  mfaRequired: true;
  mfaToken: string;
  expiresIn?: number;
};

type UseLoginWithCaptchaOptions = {
  onSuccess?: (res: LoginSuccess) => void;
  onError?: (message: string) => void;
  onMfaRequired?: (ctx: MfaRequired) => void;
};

export function useLoginWithCaptcha(options: UseLoginWithCaptchaOptions = {}) {
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [captchaEnabled, setCaptchaEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<{ username: string; password: string } | null>(null);
  const onSuccessRef = useRef(options.onSuccess);
  const onErrorRef = useRef(options.onError);
  const onMfaRequiredRef = useRef(options.onMfaRequired);
  onSuccessRef.current = options.onSuccess;
  onErrorRef.current = options.onError;
  onMfaRequiredRef.current = options.onMfaRequired;

  useEffect(() => {
    void getCaptchaConfig().then((res) => {
      if ('enabled' in res) setCaptchaEnabled(res.enabled);
      else setCaptchaEnabled(false);
    });
  }, []);

  const performLogin = useCallback(
    async (username: string, password: string, captcha?: CaptchaValues) => {
      setLoading(true);
      const res = await login(username, password, captcha);
      setLoading(false);

      if ('error' in res && res.error) {
        const code = 'code' in res ? String((res as { code?: string }).code || '') : '';
        if (code === 'EMAIL_NOT_VERIFIED') {
          onErrorRef.current?.(res.error);
        } else {
          onErrorRef.current?.(res.error);
        }
        return res;
      }

      if ('mfaRequired' in res && res.mfaRequired && res.mfaToken) {
        onMfaRequiredRef.current?.({
          mfaRequired: true,
          mfaToken: res.mfaToken,
          expiresIn: res.expiresIn,
        });
        return res;
      }

      if ('ok' in res && res.ok && res.accessToken) {
        onSuccessRef.current?.({
          ok: true,
          accessToken: res.accessToken,
          user: res.user,
        });
      }
      return res;
    },
    []
  );

  const submitCredentials = useCallback(
    async (username: string, password: string) => {
      pendingRef.current = { username, password };

      if (captchaEnabled) {
        setCaptchaOpen(true);
        return;
      }

      await performLogin(username, password);
    },
    [captchaEnabled, performLogin]
  );

  const handleCaptchaVerified = useCallback(
    async (values: CaptchaValues) => {
      setCaptchaOpen(false);
      const pending = pendingRef.current;
      if (!pending) return;
      await performLogin(pending.username, pending.password, values);
    },
    [performLogin]
  );

  const closeCaptcha = useCallback(() => {
    setCaptchaOpen(false);
  }, []);

  return {
    captchaOpen,
    captchaEnabled,
    loading,
    submitCredentials,
    handleCaptchaVerified,
    closeCaptcha,
  };
}
