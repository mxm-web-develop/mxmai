/**
 * 将生成任务或上传资产软链到知识库（支持多选）。
 * 新建文件夹在弹窗内联完成，支持指定父级。
 * 可选 prepareLinks：确认时先物化（如上传单篇文稿）再软链。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Input, Modal, Select, Space, Spin } from 'antd';
import type { InputRef } from 'antd/es/input';
import { useTranslation } from 'react-i18next';
import {
  addKnowledgeFolderStorageLink,
  addKnowledgeFolderTaskLink,
  createKnowledgeFolder,
  getKnowledgeFolders,
  type FolderItem,
} from '../../api/client';
import { buildFolderTree, type FolderTreeNode } from '../../lib/folderTree';
import { toUserFacingErrorMessage } from '../../lib/platformErrors';

function folderTagSuffix(f: FolderItem): string {
  if (!f.card_tag) return '';
  const tag =
    f.card_tag === 'style'
      ? '视觉'
      : f.card_tag === 'writing'
        ? '语感'
        : f.card_tag === 'character'
          ? '角色'
          : '知识';
  return `（${tag}）`;
}

function flattenFolderOptions(folders: FolderItem[]): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const walk = (nodes: FolderTreeNode[], prefix: string) => {
    for (const node of nodes) {
      const name = `${node.folder.name}${folderTagSuffix(node.folder)}`;
      const label = prefix ? `${prefix} / ${name}` : name;
      options.push({ value: node.folder.id, label });
      walk(node.children, label);
    }
  };
  walk(buildFolderTree(folders), '');
  return options;
}

export type PrepareKnowledgeLinksResult = {
  taskIds?: string[];
  storageObjectIds?: string[];
};

export type MoveTasksToKnowledgeFolderModalProps = {
  open: boolean;
  taskIds?: string[];
  storageObjectIds?: string[];
  /** 确认前懒解析（如上传单篇文稿得到 storageObjectId） */
  prepareLinks?: () => Promise<PrepareKnowledgeLinksResult>;
  /** 展示用数量；缺省时按已有 id + prepareLinks 估算 */
  itemCount?: number;
  onClose: () => void;
  onMoved?: (folderId: string, movedCount: number) => void;
};

export function MoveTasksToKnowledgeFolderModal({
  open,
  taskIds = [],
  storageObjectIds = [],
  prepareLinks,
  itemCount,
  onClose,
  onMoved,
}: MoveTasksToKnowledgeFolderModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [folderId, setFolderId] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
  const nameInputRef = useRef<InputRef>(null);

  const displayCount =
    itemCount ??
    Math.max(
      1,
      taskIds.length + storageObjectIds.length + (prepareLinks ? 1 : 0)
    );

  const hasWork =
    taskIds.length > 0 || storageObjectIds.length > 0 || typeof prepareLinks === 'function';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFolderId(undefined);
    setCreateOpen(false);
    setNewFolderName('');
    setParentFolderId(null);
    void getKnowledgeFolders({ force: true })
      .then((list) => {
        if (!cancelled) setFolders(list);
      })
      .catch(() => {
        if (!cancelled) setFolders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!createOpen) return;
    const timer = window.setTimeout(() => nameInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [createOpen]);

  const options = useMemo(() => flattenFolderOptions(folders), [folders]);

  const parentOptions = useMemo(
    () => [
      { value: '', label: t('common.task.moveToFolder.createParentRoot') },
      ...options,
    ],
    [options, t]
  );

  const openCreatePanel = () => {
    setCreateOpen(true);
    setNewFolderName('');
    setParentFolderId(folderId ?? null);
  };

  const closeCreatePanel = () => {
    if (creating) return;
    setCreateOpen(false);
    setNewFolderName('');
  };

  const handleCreate = async () => {
    const name = newFolderName.trim();
    if (!name) {
      message.warning(t('common.task.moveToFolder.createNameRequired'));
      nameInputRef.current?.focus();
      return;
    }
    setCreating(true);
    try {
      const res = await createKnowledgeFolder(name, parentFolderId);
      if (res.error) {
        message.error(toUserFacingErrorMessage(res.error));
        return;
      }
      const created = res.data?.data;
      const list = await getKnowledgeFolders({ force: true });
      setFolders(list);
      if (created?.id) setFolderId(created.id);
      setCreateOpen(false);
      setNewFolderName('');
      message.success(t('common.task.moveToFolder.created'));
    } finally {
      setCreating(false);
    }
  };

  const handleOk = async () => {
    if (!folderId) {
      message.warning(t('common.task.moveToFolder.selectRequired'));
      return;
    }
    if (!hasWork) return;
    setSubmitting(true);
    try {
      let linkTaskIds = [...taskIds];
      let linkStorageIds = [...storageObjectIds];
      if (prepareLinks) {
        try {
          const prepared = await prepareLinks();
          if (prepared.taskIds?.length) linkTaskIds = [...linkTaskIds, ...prepared.taskIds];
          if (prepared.storageObjectIds?.length) {
            linkStorageIds = [...linkStorageIds, ...prepared.storageObjectIds];
          }
        } catch (err) {
          message.error(toUserFacingErrorMessage(err instanceof Error ? err.message : err, { fallback: t('common.task.moveToFolder.failed') }));
          return;
        }
      }

      linkTaskIds = [...new Set(linkTaskIds.filter(Boolean))];
      linkStorageIds = [...new Set(linkStorageIds.filter(Boolean))];

      if (linkTaskIds.length === 0 && linkStorageIds.length === 0) {
        message.error(t('common.task.moveToFolder.failed'));
        return;
      }

      let ok = 0;
      const errors: string[] = [];
      for (const id of linkTaskIds) {
        const res = await addKnowledgeFolderTaskLink(folderId, id);
        if (res.error) errors.push(res.error);
        else ok += 1;
      }
      for (const id of linkStorageIds) {
        const res = await addKnowledgeFolderStorageLink(folderId, id);
        if (res.error) errors.push(res.error);
        else ok += 1;
      }
      if (ok > 0 && errors.length === 0) {
        message.success(t('common.task.moveToFolder.success', { count: ok }));
        onMoved?.(folderId, ok);
        onClose();
      } else if (ok > 0) {
        message.warning(
          t('common.task.moveToFolder.partial', { moved: ok, failed: errors.length })
        );
        onMoved?.(folderId, ok);
        onClose();
      } else {
        message.error(errors[0] || t('common.task.moveToFolder.failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const parentHint =
    parentFolderId == null
      ? t('common.task.moveToFolder.createAsRootHint')
      : t('common.task.moveToFolder.createAsChildHint', {
          name: folders.find((f) => f.id === parentFolderId)?.name ?? '',
        });

  return (
    <Modal
      open={open}
      title={t('common.task.moveToFolder.title', { count: displayCount })}
      onCancel={onClose}
      onOk={() => void handleOk()}
      okText={t('common.task.moveToFolder.confirm')}
      cancelText={t('common.cancel')}
      confirmLoading={submitting}
      destroyOnHidden
      okButtonProps={{ disabled: !folderId || loading || !hasWork || creating }}
    >
      <p style={{ marginBottom: 12, opacity: 0.85 }}>
        {t('common.task.moveToFolder.hint', { count: displayCount })}
      </p>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : (
        <div className="task-move-folder-body">
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={t('common.task.moveToFolder.placeholder')}
            style={{ width: '100%' }}
            value={folderId}
            onChange={setFolderId}
            options={options}
            notFoundContent={t('common.task.moveToFolder.emptyFolders')}
            disabled={creating}
          />

          {createOpen ? (
            <div
              className="task-move-folder-create-panel"
              style={{
                marginTop: 12,
                padding: '12px 12px 10px',
                borderRadius: 8,
                border: '1px solid var(--ant-color-border-secondary, #e5e7eb)',
                background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))',
                transition: 'opacity 180ms ease-out',
              }}
            >
              <div
                style={{
                  marginBottom: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--ant-color-text, inherit)',
                }}
              >
                {t('common.task.moveToFolder.createTitle')}
              </div>
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  fontSize: 12,
                  color: 'var(--ant-color-text-secondary, #64748b)',
                }}
              >
                {t('common.task.moveToFolder.createParentLabel')}
              </label>
              <Select
                showSearch
                optionFilterProp="label"
                style={{ width: '100%', marginBottom: 10 }}
                value={parentFolderId ?? ''}
                onChange={(v) => setParentFolderId(v === '' ? null : v)}
                options={parentOptions}
                disabled={creating}
              />
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  fontSize: 12,
                  color: 'var(--ant-color-text-secondary, #64748b)',
                }}
              >
                {t('common.task.moveToFolder.createNameLabel')}
              </label>
              <Input
                ref={nameInputRef}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t('common.task.moveToFolder.createNamePlaceholder')}
                maxLength={50}
                disabled={creating}
                onPressEnter={() => void handleCreate()}
                aria-label={t('common.task.moveToFolder.createNameLabel')}
              />
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 12,
                  color: 'var(--ant-color-text-tertiary, #94a3b8)',
                }}
              >
                {parentHint}
              </p>
              <Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }}>
                <Button size="small" onClick={closeCreatePanel} disabled={creating}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="primary"
                  size="small"
                  loading={creating}
                  onClick={() => void handleCreate()}
                >
                  {creating
                    ? t('common.task.moveToFolder.creating')
                    : t('common.task.moveToFolder.createSubmit')}
                </Button>
              </Space>
            </div>
          ) : (
            <button
              type="button"
              className="task-move-folder-create-link"
              onClick={openCreatePanel}
              style={{
                marginTop: 12,
                border: 'none',
                background: 'none',
                color: 'var(--ant-color-primary, #0284c7)',
                cursor: 'pointer',
                padding: 0,
                fontSize: 13,
              }}
            >
              {t('common.task.moveToFolder.createNew')}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
