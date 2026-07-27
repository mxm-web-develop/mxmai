import { Children, isValidElement, useMemo, type ReactElement, type ReactNode } from 'react';
import { Button, Select } from 'antd';
import { FolderInput, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TaskCreationSourceTabs } from './TaskCreationSourceTabs';
import type { TaskCreationSourceTab } from '../lib/taskCreationSource';
import './generation-task-toolbar.css';

export type GenerationTaskToolbarBulkSelectionProps = {
  selectionMode: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleSelectionMode: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkMove?: () => void;
  bulkDeleting?: boolean;
};

export type GenerationTaskToolbarProps = {
  creationSource?: {
    value: TaskCreationSourceTab;
    onChange: (value: TaskCreationSourceTab) => void;
  };
  filters?: ReactNode;
  onRefresh: () => void;
  refreshLoading?: boolean;
  bulkSelection?: GenerationTaskToolbarBulkSelectionProps;
  primaryAction: {
    label: string;
    /** 移动端主按钮短文案，默认「新建」类按钮自动截为「新建」 */
    shortLabel?: string;
    onClick: () => void;
    disabled?: boolean;
  };
};

export function GenerationTaskToolbar({
  creationSource,
  filters,
  onRefresh,
  refreshLoading = false,
  bulkSelection,
  primaryAction,
}: GenerationTaskToolbarProps) {
  const { t } = useTranslation();
  const primaryShortLabel = primaryAction.shortLabel ?? t('common.task.actions.newShort');

  return (
    <div className="generation-task-toolbar">
      <div className="generation-task-toolbar__filters">
        {creationSource ? (
          <TaskCreationSourceTabs
            value={creationSource.value}
            onChange={creationSource.onChange}
            className="generation-task-source-tabs"
          />
        ) : null}
        {filters}
      </div>

      <div className="generation-task-toolbar__actions">
        {bulkSelection ? (
          <>
            <Button
              type="default"
              className={`generation-task-toolbar__btn generation-task-toolbar__btn--ghost${
                bulkSelection.selectionMode ? ' generation-task-toolbar__btn--active' : ''
              }`}
              onClick={bulkSelection.onToggleSelectionMode}
            >
              {bulkSelection.selectionMode
                ? t('common.task.actions.cancelMultiSelect')
                : t('common.task.actions.multiSelect')}
            </Button>
            {bulkSelection.selectionMode ? (
              <>
                <Button
                  type="default"
                  className="generation-task-toolbar__btn generation-task-toolbar__btn--ghost"
                  onClick={bulkSelection.onSelectAll}
                  disabled={bulkSelection.totalCount === 0}
                >
                  {t('common.task.actions.selectAll')}
                </Button>
                {bulkSelection.onBulkMove ? (
                  <Button
                    type="default"
                    className="generation-task-toolbar__btn generation-task-toolbar__btn--ghost"
                    onClick={bulkSelection.onBulkMove}
                    disabled={bulkSelection.selectedCount === 0 || bulkSelection.bulkDeleting}
                    icon={<FolderInput size={14} strokeWidth={2} aria-hidden />}
                  >
                    {bulkSelection.selectedCount > 0
                      ? t('common.task.actions.moveWithCount', {
                          count: bulkSelection.selectedCount,
                        })
                      : t('common.task.actions.moveToFolder')}
                  </Button>
                ) : null}
                <Button
                  type="default"
                  danger
                  className="generation-task-toolbar__btn generation-task-toolbar__btn--danger"
                  onClick={bulkSelection.onBulkDelete}
                  disabled={bulkSelection.selectedCount === 0 || bulkSelection.bulkDeleting}
                  loading={bulkSelection.bulkDeleting}
                  icon={<Trash2 size={14} strokeWidth={2} aria-hidden />}
                >
                  {bulkSelection.selectedCount > 0
                    ? t('common.task.actions.deleteWithCount', {
                        count: bulkSelection.selectedCount,
                      })
                    : t('common.task.actions.delete')}
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        <Button
          type="default"
          className="generation-task-toolbar__btn generation-task-toolbar__btn--ghost generation-task-toolbar__btn--refresh"
          onClick={onRefresh}
          disabled={refreshLoading}
          aria-busy={refreshLoading}
          icon={
            <RefreshCw
              size={15}
              strokeWidth={2}
              className={refreshLoading ? 'generation-task-toolbar__spin' : undefined}
              aria-hidden
            />
          }
        >
          <span className="generation-task-toolbar__btn-label">
            {refreshLoading ? t('common.task.actions.refreshing') : t('common.task.actions.refresh')}
          </span>
        </Button>
        <Button
          type="primary"
          className="generation-task-toolbar__btn generation-task-toolbar__btn--primary"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
        >
          <span className="generation-task-toolbar__primary-label generation-task-toolbar__primary-label--full">
            {primaryAction.label}
          </span>
          <span className="generation-task-toolbar__primary-label generation-task-toolbar__primary-label--short">
            {primaryShortLabel}
          </span>
        </Button>
      </div>
    </div>
  );
}

export type GenerationTaskFilterSelectProps = {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
};

export function GenerationTaskFilterSelect({
  className = '',
  value,
  onChange,
  children,
  'aria-label': ariaLabel,
}: GenerationTaskFilterSelectProps) {
  const options = useMemo(() => {
    return Children.toArray(children)
      .filter(isValidElement)
      .map((child) => {
        const el = child as ReactElement<{ value?: string; children?: ReactNode }>;
        return {
          value: String(el.props.value ?? ''),
          label: el.props.children,
        };
      });
  }, [children]);

  return (
    <Select
      className={['generation-task-filter-select', className].filter(Boolean).join(' ')}
      value={value}
      onChange={(next) => onChange(String(next ?? ''))}
      options={options}
      aria-label={ariaLabel}
      popupMatchSelectWidth={false}
      listHeight={280}
    />
  );
}

export function GenerationTaskSearchInput({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={['generation-task-search-input', className].filter(Boolean).join(' ')}
    />
  );
}
