import './page-hint.css';
import type { ReactNode } from 'react';
import { Children } from 'react';
import { Popover } from 'antd';
import type { PopoverProps } from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

export type PageHintTone = 'info' | 'warning' | 'success';

export type PageHintProps = {
  title: string;
  description?: ReactNode;
  tone?: PageHintTone;
  /** 图标旁短标签；省略则仅图标 */
  label?: string;
  /** 需要用户注意的动态提示（如未保存） */
  emphasis?: boolean;
  placement?: PopoverProps['placement'];
  className?: string;
};

const TONE_ICON = {
  info: InfoCircleOutlined,
  warning: ExclamationCircleOutlined,
  success: CheckCircleOutlined,
} as const;

export function PageHint({
  title,
  description,
  tone = 'info',
  label,
  emphasis = false,
  placement = 'bottomLeft',
  className,
}: PageHintProps) {
  const Icon = TONE_ICON[tone];

  const content = (
    <div className="page-hint-content">
      <div className="page-hint-content__title">{title}</div>
      {description ? <div className="page-hint-content__body">{description}</div> : null}
    </div>
  );

  const classes = [
    'page-hint-trigger',
    `page-hint-trigger--${tone}`,
    emphasis ? 'page-hint-trigger--emphasis' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Popover
      content={content}
      trigger={['hover', 'click']}
      placement={placement}
      classNames={{ root: 'page-hint-popover' }}
      mouseEnterDelay={0.15}
      mouseLeaveDelay={0.05}
    >
      <button type="button" className={classes} aria-label={title}>
        <span className="page-hint-trigger__icon-wrap">
          <Icon className="page-hint-trigger__icon" aria-hidden />
          {emphasis ? <span className="page-hint-trigger__dot" aria-hidden /> : null}
        </span>
        {label ? <span className="page-hint-trigger__label">{label}</span> : null}
      </button>
    </Popover>
  );
}

/** 卡片标题 + 说明图标 */
export function pageCardTitle(title: ReactNode, hint: Omit<PageHintProps, 'className'>) {
  return (
    <span className="page-card-title-row">
      <span className="page-card-title-row__text">{title}</span>
      <PageHint {...hint} />
    </span>
  );
}

/** 面板右上角一行提示（Admin / 表单页） */
export function PageHintsBar({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return <div className="page-hints-bar">{items}</div>;
}
