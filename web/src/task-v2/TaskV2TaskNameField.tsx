import { Input } from 'antd';
import { useTranslation } from 'react-i18next';

export function TaskV2TaskNameField(props: { value: string; onChange: (next: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="schema-form__field task-v2-task-name-field">
      <div className="schema-form__label">{t('form.taskName.label')}</div>
      <Input
        value={props.value}
        maxLength={200}
        showCount
        placeholder={t('form.taskName.placeholder')}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
