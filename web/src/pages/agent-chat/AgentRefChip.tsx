import { Briefcase, FileText, Folder, Library, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentReference } from '../../api/client';

type Props = {
  reference: AgentReference;
  onRemove?: () => void;
  compact?: boolean;
};

export function AgentRefChip({ reference, onRemove, compact }: Props) {
  const { t } = useTranslation();
  const TYPE_META: Record<
    AgentReference['type'],
    { icon: typeof Folder; labelKey: string; className: string }
  > = {
    file: { icon: FileText, labelKey: 'agent.refTypes.file', className: 'is-file' },
    folder: { icon: Folder, labelKey: 'agent.refTypes.folder', className: 'is-folder' },
    knowledge: { icon: Library, labelKey: 'agent.refTypes.knowledge', className: 'is-knowledge' },
    business: { icon: Briefcase, labelKey: 'agent.refTypes.business', className: 'is-business' },
  };

  const meta = TYPE_META[reference.type] || TYPE_META.file;
  const Icon = meta.icon;
  const name = reference.label || reference.id;
  const label = t(meta.labelKey);

  return (
    <span
      className={`agent-chat-chip agent-chat-chip--ref ${meta.className}${compact ? ' is-compact' : ''}`}
      title={`${label}: ${name}`}
    >
      <Icon size={compact ? 11 : 12} aria-hidden />
      <span className="agent-chat-chip__type">{label}</span>
      <span className="agent-chat-chip__name">{name}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={t('agent.refTypes.remove', { name })}
          onClick={onRemove}
        >
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}
