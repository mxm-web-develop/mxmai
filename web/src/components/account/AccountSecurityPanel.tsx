import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, App, Button, Form, Input, Modal, Space, Tag, Typography } from 'antd';
import { SafetyCertificateOutlined, SafetyOutlined } from '@ant-design/icons';
import {
  changeMyPassword,
  disableMfaTotp,
  getMfaStatus,
  type MfaStatus,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { MfaCodeInput } from './MfaCodeInput';
import { TotpSetupModal } from './TotpSetupModal';
import { toUserFacingErrorMessage } from '../../lib/platformErrors';

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

export function AccountSecurityPanel() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { logout } = useAuth();
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordForm] = Form.useForm<PasswordFormValues>();

  const loadMfaStatus = useCallback(async () => {
    setMfaLoading(true);
    const res = await getMfaStatus();
    setMfaLoading(false);
    if (!res.error) {
      const data = (res.data as { data?: MfaStatus })?.data;
      if (data) setMfaStatus(data);
    }
  }, []);

  useEffect(() => {
    void loadMfaStatus();
  }, [loadMfaStatus]);

  const handleDisable = async () => {
    if (!disablePassword || disableCode.length !== 6) {
      message.warning(t('account.mfa.disableFieldsRequired'));
      return;
    }
    setDisableBusy(true);
    const res = await disableMfaTotp(disablePassword, disableCode);
    setDisableBusy(false);
    if (res.error) {
      message.error(toUserFacingErrorMessage(res.error));
      return;
    }
    message.success(t('account.mfa.disabledSuccess'));
    setDisableOpen(false);
    setDisablePassword('');
    setDisableCode('');
    logout();
  };

  return (
    <div className="account-security-stack">
      <section className="account-security-section" aria-labelledby="account-mfa-heading">
        <div className="account-security-section__head">
          <div className="account-security-section__title-wrap">
            <SafetyCertificateOutlined className="account-security-section__icon" aria-hidden />
            <div>
              <Typography.Title level={5} id="account-mfa-heading" style={{ margin: 0 }}>
                {t('account.mfa.title')}
              </Typography.Title>
              <Typography.Text type="secondary" className="account-security-section__desc">
                {t('account.mfa.subtitle')}
              </Typography.Text>
            </div>
          </div>
          {mfaStatus?.totpEnabled ? (
            <Tag color="success">{t('account.mfa.statusOn')}</Tag>
          ) : (
            <Tag>{t('account.mfa.statusOff')}</Tag>
          )}
        </div>

        <div className="account-security-section__body">
          {mfaStatus?.oauthOnly ? (
            <Alert type="info" showIcon title={t('account.mfa.oauthOnlyHint')} />
          ) : mfaStatus?.totpEnabled ? (
            <>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                {t('account.mfa.enabledDesc')}
              </Typography.Paragraph>
              <Button danger onClick={() => setDisableOpen(true)} loading={mfaLoading}>
                {t('account.mfa.disableButton')}
              </Button>
            </>
          ) : (
            <>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                {t('account.mfa.disabledDesc')}
              </Typography.Paragraph>
              <Button
                type="primary"
                icon={<SafetyOutlined />}
                onClick={() => setSetupOpen(true)}
                loading={mfaLoading}
                disabled={mfaStatus?.oauthOnly}
              >
                {t('account.mfa.enableButton')}
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="account-security-section" aria-labelledby="account-password-heading">
        <div className="account-security-section__head">
          <div className="account-security-section__title-wrap">
            <SafetyOutlined className="account-security-section__icon" aria-hidden />
            <div>
              <Typography.Title level={5} id="account-password-heading" style={{ margin: 0 }}>
                {t('account.password.title')}
              </Typography.Title>
              <Typography.Text type="secondary" className="account-security-section__desc">
                {t('account.password.logoutDesc')}
              </Typography.Text>
            </div>
          </div>
        </div>

        <div className="account-security-section__body">
          <Alert type="warning" showIcon title={t('account.password.logoutHint')} style={{ marginBottom: 16 }} />
          {mfaStatus?.oauthOnly ? (
            <Alert type="info" showIcon title={t('account.mfa.oauthPasswordHint')} />
          ) : (
            <Form
              form={passwordForm}
              layout="vertical"
              className="account-password-form"
              onFinish={async (values: PasswordFormValues) => {
                setPasswordSubmitting(true);
                const res = await changeMyPassword({
                  currentPassword: values.currentPassword,
                  newPassword: values.newPassword,
                });
                setPasswordSubmitting(false);
                if (res.error) {
                  message.error(toUserFacingErrorMessage(res.error));
                  return;
                }
                message.success(t('account.password.updated'));
                passwordForm.resetFields();
                logout();
              }}
            >
              <Form.Item
                label={t('account.password.current')}
                name="currentPassword"
                rules={[{ required: true, message: t('account.password.currentRequired') }]}
              >
                <Input.Password autoComplete="current-password" />
              </Form.Item>
              <Form.Item
                label={t('account.password.new')}
                name="newPassword"
                rules={[
                  { required: true, message: t('account.password.newRequired') },
                  { min: 8, message: t('account.password.minLength') },
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                label={t('account.password.confirm')}
                name="confirmNewPassword"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: t('account.password.confirmRequired') },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                      return Promise.reject(new Error(t('account.password.mismatch')));
                    },
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={passwordSubmitting}>
                  {t('account.password.update')}
                </Button>
                <Button onClick={() => passwordForm.resetFields()} disabled={passwordSubmitting}>
                  {t('account.password.clear')}
                </Button>
              </Space>
            </Form>
          )}
        </div>
      </section>

      <TotpSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onEnabled={() => {
          void loadMfaStatus();
          logout();
        }}
      />

      <Modal
        title={t('account.mfa.disableTitle')}
        open={disableOpen}
        onCancel={() => {
          setDisableOpen(false);
          setDisablePassword('');
          setDisableCode('');
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setDisableOpen(false);
              setDisablePassword('');
              setDisableCode('');
            }}
          >
            {t('common.cancel')}
          </Button>,
          <Button key="ok" type="primary" danger loading={disableBusy} onClick={() => void handleDisable()}>
            {t('account.mfa.disableConfirm')}
          </Button>,
        ]}
      >
        <Typography.Paragraph type="secondary">{t('account.mfa.disableHint')}</Typography.Paragraph>
        <Input.Password
          value={disablePassword}
          onChange={(e) => setDisablePassword(e.target.value)}
          placeholder={t('account.password.current')}
          style={{ marginBottom: 16 }}
        />
        <MfaCodeInput value={disableCode} onChange={setDisableCode} disabled={disableBusy} />
      </Modal>
    </div>
  );
}
