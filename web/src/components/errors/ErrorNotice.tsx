import React from 'react';
import { Button, Collapse, Typography } from 'antd';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { UserFacingError } from '../../lib/platformErrors';
import { toUserFacingError } from '../../lib/platformErrors';
import './ErrorNotice.css';

export type ErrorNoticeProps = {
  error?: unknown;
  /** 已解析的错误；优先于 error */
  resolved?: UserFacingError;
  isAdmin?: boolean;
  title?: string;
  /** inline | page */
  variant?: 'inline' | 'page';
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

/**
 * 产品向错误态：主文案 + 可选操作；admin 可折叠技术详情。
 */
export function ErrorNotice({
  error,
  resolved,
  isAdmin = false,
  title,
  variant = 'inline',
  actionLabel,
  onAction,
  className,
}: ErrorNoticeProps) {
  const face =
    resolved ??
    toUserFacingError(error as Parameters<typeof toUserFacingError>[0], { isAdmin });

  const heading =
    title ??
    (face.code === 'UPSTREAM_OVERLOADED' || face.code === 'UPSTREAM_UNAVAILABLE'
      ? '暂时无法完成'
      : face.code === 'UPSTREAM_CONTENT_POLICY'
        ? '内容需调整'
        : '操作未成功');

  return (
    <div
      className={`mxm-error-notice mxm-error-notice--${variant}${className ? ` ${className}` : ''}`}
      role="alert"
    >
      <div className="mxm-error-notice__icon" aria-hidden>
        <AlertCircle size={variant === 'page' ? 28 : 18} strokeWidth={1.75} />
      </div>
      <div className="mxm-error-notice__body">
        <div className="mxm-error-notice__title">{heading}</div>
        <Typography.Paragraph className="mxm-error-notice__message" type="secondary">
          {face.message}
        </Typography.Paragraph>
        {onAction ? (
          <Button
            type="default"
            size="small"
            icon={<RefreshCw size={14} />}
            onClick={onAction}
            className="mxm-error-notice__action"
          >
            {actionLabel ?? (face.retryable ? '重试' : '知道了')}
          </Button>
        ) : null}
        {isAdmin && face.debugDetail ? (
          <Collapse
            ghost
            size="small"
            className="mxm-error-notice__debug"
            items={[
              {
                key: 'debug',
                label: '技术详情（仅管理员）',
                children: (
                  <pre className="mxm-error-notice__debug-pre">{face.debugDetail}</pre>
                ),
              },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}

export default ErrorNotice;
