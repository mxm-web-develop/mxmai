/**
 * Drawer 标题行右侧：表单 / 对话 图标切换
 */
import { FormOutlined, CommentOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import type { TaskV2CreateMode } from './TaskV2CreateSurface';
import './task-v2-create-mode-switch.css';

type Props = {
  value: TaskV2CreateMode;
  onChange: (mode: TaskV2CreateMode) => void;
};

export function TaskV2CreateModeSwitch({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="task-v2-mode-switch"
      role="tablist"
      aria-label={t('agent.moduleAgent.modeSwitch')}
    >
      <Tooltip title={t('agent.moduleAgent.modeForm')}>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'form'}
          className={`task-v2-mode-switch__btn${value === 'form' ? ' is-active' : ''}`}
          onClick={() => onChange('form')}
        >
          <FormOutlined />
        </button>
      </Tooltip>
      <Tooltip title={t('agent.moduleAgent.modeChat')}>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'chat'}
          className={`task-v2-mode-switch__btn${value === 'chat' ? ' is-active' : ''}`}
          onClick={() => onChange('chat')}
        >
          <CommentOutlined />
        </button>
      </Tooltip>
    </div>
  );
}
