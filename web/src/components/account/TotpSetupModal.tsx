import { useEffect, useState } from 'react';
import { App, Button, Input, Modal, Steps, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { enableMfaTotp, setupMfaTotp } from '../../api/client';
import { MfaCodeInput } from './MfaCodeInput';
import { toUserFacingErrorMessage } from '../../lib/platformErrors';

type TotpSetupModalProps = {
  open: boolean;
  onClose: () => void;
  onEnabled: () => void;
};

export function TotpSetupModal({ open, onClose, onEnabled }: TotpSetupModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setPassword('');
      setCode('');
      setSecret('');
      setOtpauthUrl('');
      setQrDataUrl('');
    }
  }, [open]);

  useEffect(() => {
    if (!otpauthUrl) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    void import('qrcode').then((QRCode) => {
      QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 })
        .then((url) => {
          if (!cancelled) setQrDataUrl(url);
        })
        .catch(() => {
          if (!cancelled) setQrDataUrl('');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [otpauthUrl]);

  const handleSetup = async () => {
    if (!password) {
      message.warning(t('account.mfa.passwordRequired'));
      return;
    }
    setBusy(true);
    const res = await setupMfaTotp(password);
    setBusy(false);
    if (res.error) {
      message.error(toUserFacingErrorMessage(res.error));
      return;
    }
    const data = (res.data as { data?: { secret: string; otpauthUrl: string } })?.data;
    if (!data?.secret) {
      message.error(t('account.mfa.setupFailed'));
      return;
    }
    setSecret(data.secret);
    setOtpauthUrl(data.otpauthUrl);
    setStep(1);
  };

  const handleEnable = async () => {
    if (code.length !== 6) {
      message.warning(t('account.mfa.codeRequired'));
      return;
    }
    setBusy(true);
    const res = await enableMfaTotp(password, code);
    setBusy(false);
    if (res.error) {
      message.error(toUserFacingErrorMessage(res.error));
      return;
    }
    message.success(t('account.mfa.enabledSuccess'));
    onEnabled();
    onClose();
  };

  return (
    <Modal
      title={t('account.mfa.setupTitle')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={480}
      className="totp-setup-modal"
    >
      <Steps
        size="small"
        current={step}
        items={[
          { title: t('account.mfa.stepPassword') },
          { title: t('account.mfa.stepScan') },
          { title: t('account.mfa.stepVerify') },
        ]}
        style={{ marginBottom: 20 }}
      />

      {step === 0 && (
        <div className="account-security-section__body">
          <Typography.Paragraph type="secondary">{t('account.mfa.setupPasswordHint')}</Typography.Paragraph>
          <Input.Password
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('account.password.current')}
            autoComplete="current-password"
          />
          <Button type="primary" className="account-security-section__action" loading={busy} onClick={() => void handleSetup()}>
            {t('common.next')}
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="account-security-section__body totp-setup-modal__scan">
          <Typography.Paragraph type="secondary">{t('account.mfa.scanHint')}</Typography.Paragraph>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="" className="totp-setup-modal__qr" width={200} height={200} />
          ) : null}
          <Typography.Text code copyable className="totp-setup-modal__secret">
            {secret}
          </Typography.Text>
          <Button type="primary" className="account-security-section__action" onClick={() => setStep(2)}>
            {t('account.mfa.scannedContinue')}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="account-security-section__body">
          <Typography.Paragraph type="secondary">{t('account.mfa.verifyHint')}</Typography.Paragraph>
          <MfaCodeInput value={code} onChange={setCode} disabled={busy} />
          <Button type="primary" className="account-security-section__action" loading={busy} onClick={() => void handleEnable()}>
            {t('account.mfa.enableButton')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
