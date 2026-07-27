import { useCallback, useEffect, useMemo, useState } from 'react';

export function useGenerationTaskSelection(visibleTaskIds: string[]) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(visibleTaskIds);
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleTaskIds]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((mode) => {
      if (mode) setSelectedIds(new Set());
      return !mode;
    });
  }, []);

  const toggleSelected = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(visibleTaskIds));
  }, [visibleTaskIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((taskId: string) => selectedIds.has(taskId), [selectedIds]);

  return {
    selectionMode,
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelectionMode,
    toggleSelected,
    selectAll,
    clearSelection,
    isSelected,
  };
}
