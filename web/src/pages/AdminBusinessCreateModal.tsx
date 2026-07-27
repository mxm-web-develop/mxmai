import {
  Form,
  Input,
  Modal,
  Select,
} from 'antd';
import type { Scope } from './AdminBusiness.types';
import { PLATFORM_TASK_KEY_OPTIONS, isPlatformTaskKey } from './AdminBusiness.types';
import { TEXT_V2_TYPE_OPTIONS } from './admin-text-v2';

export interface AdminBusinessCreateModalProps {
  open: boolean;
  createScope: Scope;
  createTaskKey: string;
  createSubtype: string;
  onOpenChange: (v: boolean) => void;
  onScopeChange: (v: Scope) => void;
  onTaskKeyChange: (v: string) => void;
  onSubtypeChange: (v: string) => void;
  onConfirm: () => void;
}

export function AdminBusinessCreateModal({
  open,
  createScope,
  createTaskKey,
  createSubtype,
  onOpenChange,
  onScopeChange,
  onTaskKeyChange,
  onSubtypeChange,
  onConfirm,
}: AdminBusinessCreateModalProps) {
  const taskKeySelect =
    createScope === 'text' ? (
      <Select
        value={createTaskKey || undefined}
        onChange={onTaskKeyChange}
        options={[...TEXT_V2_TYPE_OPTIONS]}
        placeholder="选择 text type"
      />
    ) : (
      <Select
        value={isPlatformTaskKey(createTaskKey) ? createTaskKey : 'generator'}
        onChange={onTaskKeyChange}
        options={[...PLATFORM_TASK_KEY_OPTIONS]}
        placeholder="选择 generator / group / series"
      />
    );

  return (
    <Modal
      title="新建业务（TaskTemplate）"
      open={open}
      onCancel={() => onOpenChange(false)}
      onOk={onConfirm}
      okText="创建"
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item label="scope" required>
          <Select<Scope>
            value={createScope}
            onChange={(v) => {
              onScopeChange(v);
              if (v === 'text') {
                onTaskKeyChange('transform');
              } else if (!isPlatformTaskKey(createTaskKey)) {
                onTaskKeyChange('generator');
              }
            }}
            options={[
              { value: 'writing', label: 'writing' },
              { value: 'graph', label: 'graph' },
              { value: 'audio', label: 'audio' },
              { value: 'music', label: 'music' },
              { value: 'video', label: 'video' },
              { value: 'text', label: 'text（四档固定入参）' },
            ]}
          />
        </Form.Item>
        <Form.Item label="taskKey" required>
          {taskKeySelect}
        </Form.Item>
        <Form.Item label="subtype" required>
          <Input
            value={createSubtype}
            onChange={(e) => onSubtypeChange(e.target.value)}
            placeholder="例如：tech-outline（具体业务名，必填）"
            allowClear
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
