type TaskCardSelectCheckboxProps = {
  checked: boolean;
  onToggle: (e: React.MouseEvent) => void;
  ariaLabel?: string;
};

/** 任务卡片多选复选框（左上角） */
export function TaskCardSelectCheckbox({
  checked,
  onToggle,
  ariaLabel = '选择任务',
}: TaskCardSelectCheckboxProps) {
  return (
    <button
      type="button"
      className={`task-card-select${checked ? ' is-checked' : ''}`}
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e);
      }}
    >
      <span className="task-card-select__box" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
    </button>
  );
}
