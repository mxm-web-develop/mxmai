import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Modal } from 'antd';
import BrandLoading from '../BrandLoading';
import { ReloadOutlined } from '@ant-design/icons';
import { getSmartflowTask, type SmartflowExecutionItem } from '../../api/client';
import { ExecutionDetailContent } from './ExecutionDetailContent';
import { isActiveExecutionStatus } from './execution-detail-utils';
import { toUserFacingErrorMessage } from '../../lib/platformErrors';

export function ExecutionDetailModal({
  open,
  executionId,
  flowName,
  initialExecution,
  onClose,
  onExecutionUpdated,
}: {
  open: boolean;
  executionId: string | null;
  flowName?: string;
  initialExecution?: SmartflowExecutionItem | null;
  onClose: () => void;
  onExecutionUpdated?: (execution: SmartflowExecutionItem) => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [execution, setExecution] = useState<SmartflowExecutionItem | null>(initialExecution ?? null);
  const onExecutionUpdatedRef = useRef(onExecutionUpdated);
  onExecutionUpdatedRef.current = onExecutionUpdated;

  const fetchDetail = useCallback(async (silent = false) => {
    if (!executionId) return;
    if (!silent) setLoading(true);
    try {
      const res = await getSmartflowTask(executionId);
      if (res.error) {
        if (!silent) message.error(toUserFacingErrorMessage(res.error));
        return;
      }
      const body = res.data as { data?: SmartflowExecutionItem } | undefined;
      if (body?.data) {
        setExecution(body.data);
        onExecutionUpdatedRef.current?.(body.data);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [executionId, message]);

  useEffect(() => {
    if (!open || !executionId) return;
    if (initialExecution?.id === executionId) {
      setExecution(initialExecution);
    }
    void fetchDetail();
  }, [open, executionId, fetchDetail]);

  useEffect(() => {
    if (!open || !executionId || !execution) return;
    if (!isActiveExecutionStatus(String(execution.status))) return;
    const timer = window.setInterval(() => {
      void fetchDetail(true);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [open, executionId, execution?.status, fetchDetail]);

  return (
    <Modal
      title={
        flowName
          ? t('smartflow.execution.titleWithFlow', { name: flowName })
          : t('smartflow.execution.title')
      }
      open={open}
      onCancel={onClose}
      width={860}
      destroyOnHidden
      className="sf-exec-detail-modal"
      footer={
        <div className="sf-exec-detail-footer">
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchDetail()}>
            {t('common.refresh')}
          </Button>
          <Button type="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <BrandLoading spinning={loading && !execution}>
        {execution ? (
          <ExecutionDetailContent execution={execution} />
        ) : (
          !loading && (
            <span style={{ color: 'var(--text-secondary)' }}>{t('smartflow.execution.noData')}</span>
          )
        )}
      </BrandLoading>
    </Modal>
  );
}
