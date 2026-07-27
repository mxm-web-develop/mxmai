import { useCallback, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

/**
 * 任务预览「内容 / 数据」切换：仅 admin 可切换；
 * 其他用户始终停留在内容态（contentMode）。
 */
export function useAdminGatedViewerMode<T extends string>(contentMode: T) {
  const { isAdmin } = useAuth();
  const [mode, setMode] = useState<T>(contentMode);

  const setViewMode = useCallback(
    (next: T) => {
      if (!isAdmin) {
        setMode(contentMode);
        return;
      }
      setMode(next);
    },
    [contentMode, isAdmin]
  );

  return {
    isAdmin,
    viewMode: (isAdmin ? mode : contentMode) as T,
    setViewMode,
  };
}
