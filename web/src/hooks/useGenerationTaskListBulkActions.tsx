import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageInstance } from 'antd/es/message/interface';
import type { HookAPI } from 'antd/es/app/context';
import { deleteTasksBulk, type WritingTaskItem } from '../api/client';
import { useGenerationTaskSelection } from './useGenerationTaskSelection';
import type { GenerationTaskToolbarBulkSelectionProps } from '../components/GenerationTaskToolbar';
import { MoveTasksToKnowledgeFolderModal } from '../components/task-list/MoveTasksToKnowledgeFolderModal';

type UseGenerationTaskListBulkActionsOptions = {
  tasks: WritingTaskItem[];
  setTasks: Dispatch<SetStateAction<WritingTaskItem[]>>;
  modal: HookAPI;
  message: MessageInstance;
  onDeletedIds?: (ids: Set<string>) => void;
};

export function useGenerationTaskListBulkActions({
  tasks,
  setTasks,
  modal,
  message,
  onDeletedIds,
}: UseGenerationTaskListBulkActionsOptions) {
  const { t } = useTranslation();
  const visibleTaskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const {
    selectionMode,
    selectedIds,
    selectedCount,
    toggleSelectionMode,
    toggleSelected,
    selectAll,
    clearSelection,
    isSelected,
  } = useGenerationTaskSelection(visibleTaskIds);

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTaskIds, setMoveTaskIds] = useState<string[]>([]);

  const openMoveToFolder = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setMoveTaskIds(ids);
    setMoveOpen(true);
  }, []);

  const handleBulkMove = useCallback(() => {
    openMoveToFolder([...selectedIds]);
  }, [openMoveToFolder, selectedIds]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    modal.confirm({
      title: t('common.task.bulkDelete.title'),
      content: t('common.task.bulkDelete.content', { count: selectedIds.size }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        setBulkDeleting(true);
        try {
          const { deleted, errors } = await deleteTasksBulk([...selectedIds]);
          if (deleted.length > 0) {
            const deletedSet = new Set(deleted);
            setTasks((prev) => prev.filter((t) => !deletedSet.has(t.id)));
            onDeletedIds?.(deletedSet);
          }
          if (errors.length === 0) {
            message.success(t('common.task.bulkDelete.success', { count: deleted.length }));
            clearSelection();
            if (selectionMode) toggleSelectionMode();
          } else if (deleted.length > 0) {
            message.warning(
              t('common.task.bulkDelete.partial', {
                deleted: deleted.length,
                failed: errors.length,
              })
            );
            clearSelection();
          } else {
            message.error(errors[0]?.error ?? t('common.task.bulkDelete.failed'));
          }
        } finally {
          setBulkDeleting(false);
        }
      },
    });
  }, [selectedIds, selectionMode, modal, message, setTasks, onDeletedIds, clearSelection, toggleSelectionMode, t]);

  const wrapTaskClick = useCallback(
    (taskId: string, open: () => void) => {
      if (selectionMode) {
        toggleSelected(taskId);
        return;
      }
      open();
    },
    [selectionMode, toggleSelected]
  );

  const toolbarBulkSelection = useMemo<GenerationTaskToolbarBulkSelectionProps>(
    () => ({
      selectionMode,
      selectedCount,
      totalCount: visibleTaskIds.length,
      onToggleSelectionMode: toggleSelectionMode,
      onSelectAll: selectAll,
      onClearSelection: clearSelection,
      onBulkDelete: handleBulkDelete,
      onBulkMove: handleBulkMove,
      bulkDeleting,
    }),
    [
      selectionMode,
      selectedCount,
      visibleTaskIds.length,
      toggleSelectionMode,
      selectAll,
      clearSelection,
      handleBulkDelete,
      handleBulkMove,
      bulkDeleting,
    ]
  );

  const moveModal: ReactNode = (
    <MoveTasksToKnowledgeFolderModal
      open={moveOpen}
      taskIds={moveTaskIds}
      onClose={() => setMoveOpen(false)}
      onMoved={() => {
        clearSelection();
        if (selectionMode) toggleSelectionMode();
        setMoveOpen(false);
      }}
    />
  );

  return {
    selectionMode,
    isSelected,
    toggleSelected,
    wrapTaskClick,
    toolbarBulkSelection,
    openMoveToFolder,
    moveModal,
  };
}
