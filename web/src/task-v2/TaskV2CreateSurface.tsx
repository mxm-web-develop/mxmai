/**
 * 新建任务 Drawer 壳：表单 | 对话（切换在 Drawer 标题行，见 TaskV2CreateModeSwitch）
 */
import type { ReactNode } from 'react';
import {
  ModuleAgentChatPanel,
  type ModuleAgentScope,
} from '../components/module-agent/ModuleAgentChatPanel';
import './task-v2-create-surface.css';

export type TaskV2CreateMode = 'form' | 'chat';

type Props = {
  scope: ModuleAgentScope;
  mode: TaskV2CreateMode;
  onModeChange: (mode: TaskV2CreateMode) => void;
  children: ReactNode;
  open?: boolean;
};

export function TaskV2CreateSurface({
  scope,
  mode,
  onModeChange: _onModeChange,
  children,
  open = true,
}: Props) {
  return (
    <div
      className={`task-v2-create-surface${mode === 'chat' ? ' task-v2-create-surface--chat' : ''}`}
    >
      <div className="task-v2-create-surface__body">
        {mode === 'form' ? (
          children
        ) : (
          <ModuleAgentChatPanel scope={scope} active={open && mode === 'chat'} />
        )}
      </div>
    </div>
  );
}
