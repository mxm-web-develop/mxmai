import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type TaskCardDeleteButtonProps = {
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  deleting?: boolean;
};

/** 任务卡片删除 — 桌面短文字，移动端图标 */
export function TaskCardDeleteButton({ onClick, disabled, deleting }: TaskCardDeleteButtonProps) {
  const { t } = useTranslation();
  const label = t('common.task.actions.delete');
  return (
    <button
      type="button"
      className="task-card-delete-btn"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {deleting ? (
        <span className="task-card-delete-btn__ellipsis" aria-hidden>
          …
        </span>
      ) : (
        <>
          <Trash2 size={13} strokeWidth={2} className="task-card-delete-btn__icon" aria-hidden />
          <span className="task-card-delete-btn__text">{label}</span>
        </>
      )}
    </button>
  );
}
