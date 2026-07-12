import { useEffect, useState } from 'react';
import { App, Input, Modal, Typography } from 'antd';
import { VirtualFolderTreeSidebar } from '../asset-center';
import { VirtualFolderContentList } from '../virtual-folder/VirtualFolderContentList';
import {
  buildVirtualFolderBreadcrumb,
  loadVirtualFolderBrowse,
  loadVirtualFolderTree,
  peekVirtualFolderBrowse,
} from '../schema-fields/voiceoverAudioUtils';
import {
  isVisualVirtualFolderLink,
  resolveVirtualFolderVisualMedia,
} from '../video-timeline-review/referenceMediaVirtualFolderUtils';
import type { VirtualFolderLinkItem } from '../../api/client';
import { resolveLinkDisplayTitle } from '../virtual-folder/virtualFolderLinkDisplay';
import type { MediaPickPayload } from './types';
import '../schema-form/reference-images.css';

export type MediaVirtualFolderPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onPick: (item: MediaPickPayload) => void;
};

export function MediaVirtualFolderPickerModal({ open, onClose, onPick }: MediaVirtualFolderPickerModalProps) {
  const { message } = App.useApp();
  const [vfFolders, setVfFolders] = useState<Awaited<ReturnType<typeof loadVirtualFolderTree>>>([]);
  const [vfSelectedFolderId, setVfSelectedFolderId] = useState<string | null>(null);
  const [vfItems, setVfItems] = useState<Awaited<ReturnType<typeof loadVirtualFolderBrowse>>['items']>([]);
  const [vfSearch, setVfSearch] = useState('');
  const [vfLoading, setVfLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVfSearch('');
    void loadVirtualFolderTree()
      .then((folders) => {
        setVfFolders(folders);
        setVfSelectedFolderId(folders[0]?.id ?? null);
      })
      .catch((e) => message.error(e instanceof Error ? e.message : '加载虚拟文件夹失败'));
  }, [open, message]);

  useEffect(() => {
    if (!open || !vfSelectedFolderId) return;
    const cached = peekVirtualFolderBrowse(vfSelectedFolderId);
    if (cached?.items) setVfItems(cached.items);
    setVfLoading(true);
    void loadVirtualFolderBrowse(vfSelectedFolderId)
      .then(({ items }) => setVfItems(items))
      .finally(() => setVfLoading(false));
  }, [open, vfSelectedFolderId]);

  const vfBreadcrumb = buildVirtualFolderBreadcrumb(vfFolders, vfSelectedFolderId);
  const vfDisplayedItems = vfItems.filter((it) => {
    if (it.type === 'dir') return true;
    if (it.type !== 'link') return false;
    if (!isVisualVirtualFolderLink(it as VirtualFolderLinkItem)) return false;
    if (!vfSearch.trim()) return true;
    return (it as VirtualFolderLinkItem).name.toLowerCase().includes(vfSearch.trim().toLowerCase());
  });

  const pickFromVirtualFolder = async (link: VirtualFolderLinkItem) => {
    try {
      const resolved = await resolveVirtualFolderVisualMedia(link);
      if (!resolved?.url) {
        message.error('无法解析该软链的媒体地址');
        return;
      }
      const displayTitle = resolveLinkDisplayTitle(link);
      onPick({
        content: resolved.url,
        mediaKind: resolved.mediaKind,
        source: 'virtual-folder',
        sourceLabel: displayTitle,
        purpose: displayTitle,
      });
      message.success('已加入素材列表');
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '选取失败');
    }
  };

  return (
    <Modal
      title="虚拟文件夹"
      open={open}
      onCancel={onClose}
      footer={null}
      width={Math.min(760, typeof window !== 'undefined' ? window.innerWidth - 32 : 760)}
      destroyOnClose
      className="unified-media-source-virtual-modal"
    >
      <div className="ref-images__panel ref-images__panel--virtual" style={{ display: 'flex', gap: 12, minHeight: 320 }}>
        <aside style={{ width: 200, flexShrink: 0 }}>
          {vfFolders.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              暂无虚拟文件夹
            </Typography.Text>
          ) : (
            <VirtualFolderTreeSidebar
              folders={vfFolders}
              selectedFolderId={vfSelectedFolderId}
              onSelect={setVfSelectedFolderId}
              onDeleteFolder={() => undefined}
              getItemCount={() => 0}
            />
          )}
        </aside>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ref-images__panel-head">
            <div className="ref-images__panel-title">
              {vfBreadcrumb.length > 0 ? vfBreadcrumb.map((f) => f.name).join(' / ') : '请选择文件夹'}
            </div>
          </div>
          <Input
            size="small"
            allowClear
            placeholder="搜索名称…"
            value={vfSearch}
            onChange={(e) => setVfSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          {vfSelectedFolderId ? (
            <VirtualFolderContentList
              items={vfDisplayedItems}
              loading={vfLoading}
              compact
              emptyDescription={vfSearch.trim() ? '无匹配素材' : '此文件夹暂无可选图片/视频'}
              onOpenDir={setVfSelectedFolderId}
              onPickLink={(link) => void pickFromVirtualFolder(link)}
            />
          ) : (
            <Typography.Text type="secondary">请从左侧选择虚拟文件夹</Typography.Text>
          )}
        </div>
      </div>
    </Modal>
  );
}
