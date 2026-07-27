import { useTranslation } from 'react-i18next';
import { Checkbox } from 'antd';
import './checkbox-group-field.css';

export type CheckboxGroupOption = { value: string; label: string };

export type CheckboxGroupSection = {
  label: string;
  options: CheckboxGroupOption[];
};

type CheckboxGroupFieldProps = {
  value: unknown;
  options: CheckboxGroupOption[];
  sections?: CheckboxGroupSection[];
  maxItems?: number;
  onChange: (next: string[]) => void;
};

function normalizeSelected(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((s) => s.trim() !== '');
}

function capSelection(values: string[], maxItems?: number): string[] {
  const uniq = Array.from(new Set(values));
  if (maxItems != null && maxItems > 0 && uniq.length > maxItems) {
    return uniq.slice(0, maxItems);
  }
  return uniq;
}

export function CheckboxGroupField({
  value,
  options,
  sections,
  maxItems,
  onChange,
}: CheckboxGroupFieldProps) {
  const { t } = useTranslation();
  const selected = normalizeSelected(value);
  const selectedSet = new Set(selected);

  const toggle = (optionValue: string, checked: boolean) => {
    const next = checked
      ? [...selected, optionValue]
      : selected.filter((v) => v !== optionValue);
    onChange(capSelection(next, maxItems));
  };

  const selectSectionAll = (section: CheckboxGroupSection) => {
    const sectionValues = section.options.map((o) => o.value);
    onChange(capSelection([...selected, ...sectionValues], maxItems));
  };

  const clearSectionAll = (section: CheckboxGroupSection) => {
    const sectionSet = new Set(section.options.map((o) => o.value));
    onChange(selected.filter((v) => !sectionSet.has(v)));
  };

  const renderOption = (opt: CheckboxGroupOption) => (
    <label key={opt.value} className="schema-checkbox-group__item">
      <Checkbox
        checked={selectedSet.has(opt.value)}
        onChange={(e) => toggle(opt.value, e.target.checked)}
      >
        {opt.label}
      </Checkbox>
    </label>
  );

  const flatSections =
    sections && sections.length > 0 ? sections : [{ label: '', options }];

  return (
    <div className="schema-checkbox-group">
      {flatSections.map((section, index) => {
        const sectionKey = section.label || `section-${index}`;
        const sectionValues = section.options.map((o) => o.value);
        const selectedInSection = sectionValues.filter((v) => selectedSet.has(v)).length;
        const allSelected =
          sectionValues.length > 0 && selectedInSection === sectionValues.length;
        const showBulkActions = section.options.length > 0;

        return (
          <div key={sectionKey} className="schema-checkbox-group__section">
            {section.label || showBulkActions ? (
              <div className="schema-checkbox-group__section-head">
                {section.label ? (
                  <div className="schema-checkbox-group__section-title">
                    {section.label}
                    {selectedInSection > 0 ? (
                      <span className="schema-checkbox-group__section-count">
                        {t('form.checkboxGroup.selectedInSection', {
                          selected: selectedInSection,
                          total: sectionValues.length,
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span />
                )}
                {showBulkActions ? (
                  <div className="schema-checkbox-group__section-actions">
                    <button
                      type="button"
                      className="schema-checkbox-group__bulk-btn"
                      disabled={allSelected}
                      onClick={() => selectSectionAll(section)}
                    >
                      {t('form.checkboxGroup.selectAll')}
                    </button>
                    <button
                      type="button"
                      className="schema-checkbox-group__bulk-btn"
                      disabled={selectedInSection === 0}
                      onClick={() => clearSectionAll(section)}
                    >
                      {t('form.checkboxGroup.clearAll')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="schema-checkbox-group__grid">
              {section.options.map((opt) => renderOption(opt))}
            </div>
          </div>
        );
      })}
      {selected.length > 0 ? (
        <p className="schema-checkbox-group__summary">{t('form.checkboxGroup.summary', { count: selected.length })}</p>
      ) : null}
    </div>
  );
}
