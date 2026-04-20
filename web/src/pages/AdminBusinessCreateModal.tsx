
import {
  Form,
  Input,
  Modal,
  Select,
} from 'antd';
import type { Scope } from './AdminBusiness.types';

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
  return (
    <Modal
      title="新建业务（TaskTemplate）"
      open={open}
      onCancel={() => onOpenChange(false)}
      onOk={onConfirm}
      okText="创建"
    >
      <Form layout="vertical">
        <Form.Item label="scope" required>
          <Select<Scope>
            value={createScope}
            onChange={onScopeChange}
            options={[
              { value: 'writing', label: 'writing' },
              { value: 'outline', label: 'outline' },
              { value: 'graph', label: 'graph' },
              { value: 'audio', label: 'audio' },
              { value: 'music', label: 'music' },
              { value: 'video', label: 'video' },
              { value: 'text', label: 'text' },
            ]}
          />
        </Form.Item>
        <Form.Item label="taskKey" required>
          <Input
            value={createTaskKey}
            onChange={(e) => onTaskKeyChange(e.target.value)}
            placeholder="例如：outlines"
          />
        </Form.Item>
        <Form.Item label="subtype（可选）">
          <Input
            value={createSubtype}
            onChange={(e) => onSubtypeChange(e.target.value)}
            placeholder="例如：tech-article"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
