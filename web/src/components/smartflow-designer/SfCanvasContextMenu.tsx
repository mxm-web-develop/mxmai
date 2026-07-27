import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Menu, type MenuProps } from 'antd';
import {
  buildNodeCatalog,
  buildNodeCatalogGroups,
  catalogByGroup,
  type CatalogContext,
} from './nodeCatalog';
import { getBusinessScopes } from './schemaFlow';

const MENU_EST_W = 220;
const MENU_EST_H = 320;

function clampPosition(x: number, y: number): { left: number; top: number } {
  const pad = 8;
  let left = x;
  let top = y;
  if (left + MENU_EST_W > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - MENU_EST_W - pad);
  }
  if (top + MENU_EST_H > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - MENU_EST_H - pad);
  }
  return { left, top };
}

export function buildCanvasContextMenuItems(
  catalogCtx: CatalogContext,
  onAfterPick: () => void,
  t: TFunction,
  options?: { disabledIds?: string[] }
): MenuProps['items'] {
  const disabled = new Set(options?.disabledIds ?? []);
  const grouped = catalogByGroup(buildNodeCatalog(getBusinessScopes(), t));
  return buildNodeCatalogGroups(t)
    .filter((g) => (grouped[g.key]?.length ?? 0) > 0)
    .map((g) => ({
    key: g.key,
    label: g.title,
    children: (grouped[g.key] ?? []).map((item) => {
      const isDisabled = disabled.has(item.id);
      return {
        key: item.id,
        label: item.label,
        disabled: isDisabled,
        title: isDisabled
          ? item.id === 'start'
            ? t('smartflow.designer.startExists')
            : item.id === 'end'
              ? t('smartflow.designer.endExists')
              : undefined
          : item.description,
        onClick: isDisabled
          ? undefined
          : () => {
              item.run(catalogCtx);
              onAfterPick();
            },
      };
    }),
  }));
}

type Props = {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  catalogCtx: CatalogContext;
  disabledIds?: string[];
};

export function SfCanvasContextMenu({ open, x, y, onClose, catalogCtx, disabledIds }: Props) {
  const { t } = useTranslation();
  const menuItems = useMemo(
    () => buildCanvasContextMenuItems(catalogCtx, onClose, t, { disabledIds }),
    [catalogCtx, onClose, disabledIds, t]
  );

  const pos = useMemo(() => clampPosition(x, y), [x, y]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /** 遮罩不拦截指针，避免移向子菜单时经过间隙导致 hover 断开 */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (
        el.closest('.sf-canvas-context-menu') ||
        el.closest('.sf-canvas-context-menu-popup')
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="sf-context-menu-backdrop" role="presentation" aria-hidden />
      <div
        className="sf-canvas-context-menu"
        style={{ left: pos.left, top: pos.top }}
        role="menu"
        aria-label="添加节点"
        onContextMenu={(e) => e.preventDefault()}
      >
        <Menu
          mode="vertical"
          selectable={false}
          items={menuItems}
          style={{ minWidth: MENU_EST_W }}
          triggerSubMenuAction="hover"
          subMenuOpenDelay={0.05}
          subMenuCloseDelay={0.35}
          classNames={{ popup: 'sf-canvas-context-menu-popup' }}
          styles={{
            popup: {
              root: {
                zIndex: 1200,
                marginLeft: -6,
              },
            },
          }}
        />
      </div>
    </>,
    document.body
  );
}
