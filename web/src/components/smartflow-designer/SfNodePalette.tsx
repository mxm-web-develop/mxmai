import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse, Tooltip, Typography } from 'antd';
import {
  buildNodeCatalog,
  buildNodeCatalogGroups,
  catalogByGroup,
  type CatalogContext,
} from './nodeCatalog';
import { getBusinessScopes } from './schemaFlow';

type Props = {
  catalogCtx: CatalogContext;
};

export function SfNodePalette({ catalogCtx }: Props) {
  const { t, i18n } = useTranslation();
  const businessScopes = useMemo(() => getBusinessScopes(), [i18n.language]);
  const items = useMemo(() => buildNodeCatalog(businessScopes, t), [businessScopes, t]);
  const grouped = catalogByGroup(items);
  const catalogGroups = buildNodeCatalogGroups(t);

  const collapseItems = catalogGroups.map((g) => ({
    key: g.key,
    label: (
      <Typography.Text strong style={{ fontSize: 12 }}>
        {g.title}
      </Typography.Text>
    ),
    children: (
      <div className="sf-palette-items">
        {(grouped[g.key] ?? []).map((item) => (
          <Tooltip key={item.id} title={item.description} placement="right">
            <button
              type="button"
              className={`sf-palette-item sf-palette-item--${item.group}`}
              onClick={() => item.run(catalogCtx)}
            >
              <span className="sf-palette-item__label">{item.label}</span>
              {item.group === 'agent' && <span className="sf-palette-item__badge">Agent</span>}
            </button>
          </Tooltip>
        ))}
      </div>
    ),
  }));

  return (
    <aside className="sf-node-palette">
      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
        {t('smartflow.designer.nodeLibraryHint')}
      </Typography.Text>
      <Collapse
        size="small"
        defaultActiveKey={['flow', 'agent', 'business']}
        ghost
        items={collapseItems}
      />
    </aside>
  );
}
