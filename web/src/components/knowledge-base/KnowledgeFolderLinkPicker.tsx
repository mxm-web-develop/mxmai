import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Modal, Tabs } from 'antd';
import {
  getFolders,
  listCompletedTasksForPickerScope,
  listStorageObjects,
  peekStorageObjectsList,
  prefetchStorageObjectPreviews,
  type FolderItem,
  type StorageObjectListItem,
  type WritingTaskItem,
} from '../../api/client';
import { GraphTaskThumb } from '../GraphTaskThumb';
import { VideoTaskThumb } from '../VideoTaskThumb';
import { TaskCreationSourceTabs } from '../TaskCreationSourceTabs';
import { TaskListLoading } from '../asset-loading';
import { FolderTreeSidebar } from '../asset-center';
import { useGraphTaskThumbnails } from '../../hooks/useGraphTaskThumbnails';
import { useVideoTaskThumbnails } from '../../hooks/useVideoTaskThumbnails';
import type { TaskCreationSourceTab } from '../../lib/taskCreationSource';
import {
  getCachedPickerTasks,
  getCachedPickerUploads,
  setCachedPickerTasks,
  setCachedPickerUploads,
  type KnowledgeFolderPickerScope,
} from '../../lib/knowledgeFolderPickerCache';
import {
  formatPickerTaskId,
  getPickerTaskBusinessLabel,
  getPickerTaskTitle,
} from './pickerTaskDisplay';
import {
  buildTaskSelectionLabelMap,
  formatTaskBusinessDisplayFull,
  useTaskFormConfigList,
  type TaskV2Scope,
} from '../../task-v2';
import { UploadPickerThumb } from './UploadPickerThumb';
import { WritingTaskCard } from '../task-list/WritingTaskCard';
import { TaskGridCard } from '../task-list/TaskGridCard';
import { AudioTaskVisual } from '../task-list/AudioTaskVisual';
import { MusicTaskVisual } from '../task-list/MusicTaskVisual';
import { getTaskStatusLabel } from '../../i18n/taskStatus';

type TaskTabKey = Exclude<KnowledgeFolderPickerScope, 'upload'>;

const PICKER_TASK_V2_SCOPE: Record<TaskTabKey, TaskV2Scope> = {
  writing: 'writing',
  graph: 'graph',
  video: 'video',
  audio: 'audio',
  music: 'music',
};

const UPLOAD_LIST_OPTIONS = {
  storageMode: 'asset' as const,
  uploadSource: 'self' as const,
  limit: 100,
};

type KnowledgeFolderLinkPickerProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (selectedIds: string[], mode: 'task' | 'upload') => void | Promise<void>;
};

function buildFolderCountMap(items: StorageObjectListItem[]): Map<string | null, number> {
  const m = new Map<string | null, number>();
  for (const item of items) {
    const fid = item.folderId ?? null;
    m.set(fid, (m.get(fid) ?? 0) + 1);
  }
  return m;
}

export function KnowledgeFolderLinkPicker({ open, onClose, onConfirm }: KnowledgeFolderLinkPickerProps) {
  const { t } = useTranslation();
  const taskTabs = useMemo(
    (): Array<{ key: TaskTabKey; label: string }> => [
      { key: 'writing', label: t('assets.knowledgeBase.linkTypes.writing') },
      { key: 'graph', label: t('assets.knowledgeBase.linkTypes.graph') },
      { key: 'video', label: t('assets.knowledgeBase.linkTypes.video') },
      { key: 'audio', label: t('assets.knowledgeBase.linkTypes.audio') },
      { key: 'music', label: t('assets.knowledgeBase.linkTypes.music') },
    ],
    [t]
  );
  const tabFallbackTitle = useMemo(
    (): Record<TaskTabKey, string> => ({
      writing: t('assets.knowledgeBase.taskTypes.writing'),
      graph: t('assets.knowledgeBase.taskTypes.graph'),
      video: t('assets.knowledgeBase.taskTypes.video'),
      audio: t('assets.knowledgeBase.taskTypes.audio'),
      music: t('assets.knowledgeBase.taskTypes.music'),
    }),
    [t]
  );
  const [activeTab, setActiveTab] = useState<KnowledgeFolderPickerScope>('graph');
  const [creationSourceTab, setCreationSourceTab] = useState<TaskCreationSourceTab>('web');
  const [tasks, setTasks] = useState<WritingTaskItem[]>([]);
  const [uploads, setUploads] = useState<StorageObjectListItem[]>([]);
  const [uploadFolders, setUploadFolders] = useState<FolderItem[]>([]);
  const [selectedUploadFolderId, setSelectedUploadFolderId] = useState<string | null>(null);
  const [allUploadItems, setAllUploadItems] = useState<StorageObjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [uploadSearch, setUploadSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [autoFolderPicked, setAutoFolderPicked] = useState(false);

  const isUploadTab = activeTab === 'upload';
  const activeTaskV2Scope = !isUploadTab ? PICKER_TASK_V2_SCOPE[activeTab] : null;
  const { taskOptions: pickerTaskOptions } = useTaskFormConfigList({
    scope: activeTaskV2Scope ?? 'graph',
    enabled: open && !isUploadTab && !!activeTaskV2Scope,
  });
  const pickerTaskLabelMap = useMemo(
    () => buildTaskSelectionLabelMap(pickerTaskOptions),
    [pickerTaskOptions]
  );
  const completedTaskIds = useMemo(
    () => (isUploadTab ? [] : tasks.filter((t) => t.status === 'completed').map((t) => t.id)),
    [isUploadTab, tasks]
  );
  const taskById = useMemo(() => {
    const map: Record<string, WritingTaskItem> = {};
    for (const t of tasks) map[t.id] = t;
    return map;
  }, [tasks]);

  const folderCounts = useMemo(() => buildFolderCountMap(allUploadItems), [allUploadItems]);
  const getUploadFolderCount = useCallback(
    (folderId: string | null) => folderCounts.get(folderId) ?? 0,
    [folderCounts]
  );

  const selectedUploadFolder = useMemo(
    () => uploadFolders.find((f) => f.id === selectedUploadFolderId) ?? null,
    [uploadFolders, selectedUploadFolderId]
  );

  const { thumbMap: graphThumbMap, requestThumbnail: requestGraphThumb } =
    useGraphTaskThumbnails(activeTab === 'graph' ? completedTaskIds : []);
  const { thumbMap: videoThumbMap, requestThumbnail: requestVideoThumb } = useVideoTaskThumbnails(
    activeTab === 'video' ? completedTaskIds : [],
    taskById
  );

  const loadUploadFoldersMeta = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const [folders, assetRes] = await Promise.all([
        getFolders({ force: true }),
        listStorageObjects(
          { storageMode: 'asset', uploadSource: 'self', limit: 500 },
          { force: true }
        ),
      ]);
      setUploadFolders(folders);
      setAllUploadItems(assetRes.items);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  const loadUploadList = useCallback(async () => {
    if (!open || activeTab !== 'upload') return;

    const listOptions = {
      ...UPLOAD_LIST_OPTIONS,
      folderId: selectedUploadFolderId,
    };

    const sessionCached = peekStorageObjectsList(listOptions);
    if (sessionCached) {
      setUploads(sessionCached.items);
      setLoading(false);
      prefetchStorageObjectPreviews(sessionCached.items);
      return;
    }

    const pickerCached = getCachedPickerUploads(selectedUploadFolderId);
    if (pickerCached) {
      setUploads(pickerCached);
      setLoading(false);
      prefetchStorageObjectPreviews(pickerCached);
      return;
    }

    setUploads([]);
    setLoading(true);
    try {
      const res = await listStorageObjects(listOptions);
      setUploads(res.items);
      setCachedPickerUploads(selectedUploadFolderId, res.items);
      prefetchStorageObjectPreviews(res.items);
    } finally {
      setLoading(false);
    }
  }, [activeTab, open, selectedUploadFolderId]);

  const loadTaskTab = useCallback(async () => {
    if (!open || activeTab === 'upload') return;

    const cached = getCachedPickerTasks(activeTab, creationSourceTab);
    if (cached) {
      setTasks(cached);
      setLoading(false);
      return;
    }

    setTasks([]);
    setLoading(true);
    try {
      const list = await listCompletedTasksForPickerScope(activeTab, {
        limit: 100,
        creationSource: creationSourceTab,
      });
      setTasks(list);
      setCachedPickerTasks(activeTab, creationSourceTab, list);
    } finally {
      setLoading(false);
    }
  }, [activeTab, creationSourceTab, open]);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
  }, [open, activeTab, creationSourceTab]);

  useEffect(() => {
    if (!open || !isUploadTab) return;
    setAutoFolderPicked(false);
    setUploadSearch('');
    void loadUploadFoldersMeta();
  }, [open, isUploadTab, loadUploadFoldersMeta]);

  /** 根目录无文件时，自动定位到第一个有文件的上传子文件夹 */
  useEffect(() => {
    if (!open || !isUploadTab || foldersLoading || autoFolderPicked) return;
    if (selectedUploadFolderId !== null) {
      setAutoFolderPicked(true);
      return;
    }
    const rootCount = folderCounts.get(null) ?? 0;
    if (rootCount > 0) {
      setAutoFolderPicked(true);
      return;
    }
    const firstWithFiles = uploadFolders.find((f) => (folderCounts.get(f.id) ?? 0) > 0);
    if (firstWithFiles) {
      setSelectedUploadFolderId(firstWithFiles.id);
    }
    setAutoFolderPicked(true);
  }, [
    open,
    isUploadTab,
    foldersLoading,
    autoFolderPicked,
    selectedUploadFolderId,
    folderCounts,
    uploadFolders,
  ]);

  useEffect(() => {
    if (!open) return;
    if (isUploadTab) void loadUploadList();
    else void loadTaskTab();
  }, [open, isUploadTab, loadUploadList, loadTaskTab]);

  useEffect(() => {
    if (!open) {
      setActiveTab('graph');
      setCreationSourceTab('web');
      setTasks([]);
      setUploads([]);
      setUploadFolders([]);
      setAllUploadItems([]);
      setSelectedUploadFolderId(null);
      setUploadSearch('');
      setAutoFolderPicked(false);
      setSelected(new Set());
    }
  }, [open]);

  const filteredUploads = useMemo(() => {
    const q = uploadSearch.trim().toLowerCase();
    if (!q) return uploads;
    return uploads.filter(
      (it) =>
        (it.originalName || '').toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q)
    );
  }, [uploads, uploadSearch]);

  const handleTabChange = (key: string) => {
    setActiveTab(key as KnowledgeFolderPickerScope);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    void onConfirm([...selected], isUploadTab ? 'upload' : 'task');
  };

  const emptyDescription = isUploadTab
    ? selectedUploadFolder
      ? t('assets.knowledgeBase.emptyUploadFolder', { folder: selectedUploadFolder.name })
      : t('assets.knowledgeBase.emptyUploadRoot')
    : creationSourceTab === 'open_api'
      ? t('assets.knowledgeBase.emptyPartnerTasks', {
          scope: taskTabs.find((tab) => tab.key === activeTab)?.label ?? '',
        })
      : t('assets.knowledgeBase.emptyCompletedTasks', {
          scope: taskTabs.find((tab) => tab.key === activeTab)?.label ?? '',
        });

  const renderTaskCard = (task: WritingTaskItem) => {
    const checked = selected.has(task.id);
    const title = getPickerTaskTitle(task, tabFallbackTitle[activeTab as TaskTabKey]);
    const statusLabel = getTaskStatusLabel(task.status, t);
    const { taskLabel: typeLabel, subtypeLabel } =
      !isUploadTab && pickerTaskLabelMap.size > 0
        ? formatTaskBusinessDisplayFull(pickerTaskLabelMap, task)
        : {
            taskLabel: '',
            subtypeLabel:
              !isUploadTab && pickerTaskLabelMap.size > 0
                ? getPickerTaskBusinessLabel(task, pickerTaskLabelMap)
                : '',
          };

    // 写作 / 音频 / 音乐：与「我的创作」列表同一套卡片
    if (activeTab === 'writing') {
      return (
        <WritingTaskCard
          key={task.id}
          task={task}
          title={title}
          status={task.status}
          statusLabel={statusLabel}
          typeLabel={typeLabel || undefined}
          subtypeLabel={subtypeLabel || undefined}
          showDelete={false}
          onClick={() => toggleSelect(task.id)}
          deleting={false}
          selectionMode
          selected={checked}
          onToggleSelect={() => toggleSelect(task.id)}
        />
      );
    }

    if (activeTab === 'audio' || activeTab === 'music') {
      const prefix = activeTab === 'music' ? 'music' : 'audio';
      return (
        <TaskGridCard
          key={task.id}
          task={task}
          prefix={prefix}
          title={title}
          status={task.status}
          statusLabel={statusLabel}
          subtypeLabel={subtypeLabel || typeLabel || undefined}
          showDelete={false}
          visual={
            activeTab === 'music' ? (
              <MusicTaskVisual task={task} status={task.status} />
            ) : (
              <AudioTaskVisual task={task} status={task.status} />
            )
          }
          onClick={() => toggleSelect(task.id)}
          onDelete={() => undefined}
          deleting={false}
          selectionMode
          selected={checked}
          onToggleSelect={() => toggleSelect(task.id)}
        />
      );
    }

    return (
      <li
        key={task.id}
        className={`graph-task-item graph-task-item-clickable vf-link-picker-item${checked ? ' vf-link-picker-item--selected generation-task-item--selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={checked}
        onClick={() => toggleSelect(task.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSelect(task.id);
          }
        }}
      >
        {activeTab === 'graph' ? (
          <GraphTaskThumb
            taskId={task.id}
            status={task.status}
            thumbUrl={graphThumbMap[task.id]}
            onRequest={requestGraphThumb}
          />
        ) : (
          <VideoTaskThumb
            taskId={task.id}
            status={task.status}
            thumbUrl={videoThumbMap[task.id]}
            onRequest={requestVideoThumb}
          />
        )}
        <div className="graph-task-content">
          <span className="graph-task-title" title={title}>
            {title}
          </span>
          <div className="graph-task-meta">
            {subtypeLabel || typeLabel ? (
              <span className="graph-task-subtype">{subtypeLabel || typeLabel}</span>
            ) : null}
            <code className="graph-task-id" title={task.id}>
              {formatPickerTaskId(task.id)}
            </code>
          </div>
        </div>
        {checked ? <span className="vf-link-picker-check" aria-hidden>✓</span> : null}
      </li>
    );
  };

  const renderUploadCard = (o: StorageObjectListItem) => {
    const checked = selected.has(o.id);
    const name = o.originalName ?? o.id;
    return (
      <li
        key={o.id}
        className={`graph-task-item graph-task-item-clickable vf-link-picker-item${checked ? ' vf-link-picker-item--selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={checked}
        onClick={() => toggleSelect(o.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSelect(o.id);
          }
        }}
      >
        <UploadPickerThumb objectId={o.id} contentUrl={o.url} contentType={o.contentType} />
        <div className="graph-task-content">
          <span className="graph-task-title" title={name}>
            {name}
          </span>
          <div className="graph-task-meta">
            <span className="graph-task-subtype">{o.contentType ?? t('assets.knowledgeBase.file')}</span>
            <code className="graph-task-id" title={o.id}>
              {formatPickerTaskId(o.id)}
            </code>
          </div>
        </div>
        {checked ? <span className="vf-link-picker-check" aria-hidden>✓</span> : null}
      </li>
    );
  };

  const renderUploadPanel = () => (
    <div className="vf-link-picker-upload-layout">
      <aside className="vf-link-picker-upload-sidebar">
        <div className="vf-link-picker-upload-sidebar-title">{t('assets.knowledgeBase.uploadFolders')}</div>
        {foldersLoading && uploadFolders.length === 0 ? (
          <TaskListLoading layout="row-list" kind="writing" count={3} />
        ) : (
          <FolderTreeSidebar
            folders={uploadFolders}
            selectedFolderId={selectedUploadFolderId}
            onSelect={setSelectedUploadFolderId}
            onDeleteFolder={() => undefined}
            getItemCount={getUploadFolderCount}
            rootLabel={t('assets.knowledgeBase.root')}
            readOnly
          />
        )}
      </aside>
      <div className="vf-link-picker-upload-main">
        <div className="vf-link-picker-upload-path">
          📂 <strong>{selectedUploadFolder?.name ?? t('assets.knowledgeBase.root')}</strong>
          <span className="muted">
            {' '}
            · {t('assets.knowledgeBase.filesCount', { count: getUploadFolderCount(selectedUploadFolderId) })}
          </span>
          {selected.size > 0 ? (
            <span className="vf-link-picker-selected-hint">
              {' '}
              · {t('assets.knowledgeBase.selectedCount', { count: selected.size })}
            </span>
          ) : null}
        </div>
        <div className="vf-link-picker-upload-search">
          <input
            type="search"
            className="vf-link-picker-upload-search-input"
            placeholder={t('assets.knowledgeBase.searchFilePlaceholder')}
            value={uploadSearch}
            onChange={(e) => setUploadSearch(e.target.value)}
          />
        </div>
        <div className="vf-link-picker-scroll vf-link-picker-scroll--upload">
          {loading ? (
            <TaskListLoading layout="media-grid" kind="image" count={6} />
          ) : filteredUploads.length === 0 ? (
            <Empty
              description={
                uploadSearch.trim()
                  ? t('assets.knowledgeBase.noMatchFiles', {
                      folder: selectedUploadFolder?.name ?? t('assets.knowledgeBase.root'),
                    })
                  : emptyDescription
              }
            />
          ) : (
            <ul className="graph-task-list vf-link-picker-list">
              {filteredUploads.map(renderUploadCard)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  const renderTaskPanel = () => (
    <>
      <div className="vf-link-picker-source">
        <TaskCreationSourceTabs
          value={creationSourceTab}
          onChange={setCreationSourceTab}
          className="task-creation-source-tabs"
        />
      </div>
      <div className="vf-link-picker-scroll">
        {loading ? (
          <TaskListLoading
            layout="media-grid"
            kind={
              activeTab === 'writing'
                ? 'writing'
                : activeTab === 'video'
                  ? 'video'
                  : activeTab === 'audio' || activeTab === 'music'
                    ? 'audio'
                    : 'image'
            }
            count={6}
          />
        ) : tasks.length === 0 ? (
          <Empty description={emptyDescription} />
        ) : (
          <ul
            className={
              activeTab === 'writing'
                ? 'writing-task-list vf-link-picker-list'
                : activeTab === 'audio'
                  ? 'audio-task-list vf-link-picker-list'
                  : activeTab === 'music'
                    ? 'music-task-list vf-link-picker-list'
                    : 'graph-task-list vf-link-picker-list'
            }
          >
            {tasks.map(renderTaskCard)}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <Modal
      title={t('assets.knowledgeBase.addLinkTitle')}
      open={open}
      onCancel={onClose}
      onOk={handleConfirm}
      okText={t('assets.knowledgeBase.add')}
      okButtonProps={{ disabled: selected.size === 0 }}
      width={isUploadTab ? 920 : 820}
      destroyOnClose
    >
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          ...taskTabs.map((tab) => ({ key: tab.key, label: tab.label })),
          { key: 'upload', label: t('assets.knowledgeBase.uploaded') },
        ]}
      />
      {isUploadTab ? renderUploadPanel() : renderTaskPanel()}
    </Modal>
  );
}
