import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CaptchaValues } from './CaptchaField';
import { SliderCaptchaCore } from './SliderCaptchaCore';
import './captcha-verify.css';

type CaptchaVerifyModalProps = {
  open: boolean;
  onClose: () => void;
  onVerified: (values: CaptchaValues) => void;
};

export function CaptchaVerifyModal({ open, onClose, onVerified }: CaptchaVerifyModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setError('');
      setRefreshKey((k) => k + 1);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    onClose();
  };

  const handleVerified = (values: CaptchaValues) => {
    setError('');
    onVerified(values);
  };

  return (
    <dialog
      ref={dialogRef}
      className="mxm-captcha-dialog"
      onClose={handleClose}
      onCancel={handleClose}
      aria-labelledby="mxm-captcha-title"
    >
      <div className="mxm-captcha-dialog__panel">
        <button
          type="button"
          className="mxm-captcha-dialog__close"
          onClick={handleClose}
          aria-label={t('landing.modalClose')}
        >
          <X size={16} />
        </button>

        <div className="mxm-captcha-dialog__header">
          <span className="mxm-captcha-dialog__icon" aria-hidden>
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 id="mxm-captcha-title">{t('landing.captchaModalTitle')}</h2>
            <p>{t('landing.captchaModalSubtitle')}</p>
          </div>
        </div>

        <SliderCaptchaCore
          active={open}
          refreshKey={refreshKey}
          className="mxm-slider-captcha mxm-slider-captcha--modal"
          onVerified={handleVerified}
          onError={setError}
        />

        {error && (
          <p className="mxm-captcha-dialog__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
