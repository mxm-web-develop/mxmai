import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from 'antd';
import { ErrorNotice } from './ErrorNotice';

type Props = {
  children: ReactNode;
  isAdmin?: boolean;
  /** 局部边界时可选标题 */
  fallbackTitle?: string;
};

type State = {
  error: Error | null;
  componentStack?: string;
};

/**
 * React 渲染崩溃兜底：产品文案 + 刷新；admin 可见 componentStack。
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? undefined });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ error: null, componentStack: undefined });
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    const isAdmin = Boolean(this.props.isAdmin);
    const debugDetail = isAdmin
      ? [error.message, componentStack].filter(Boolean).join('\n\n')
      : undefined;

    return (
      <div className="mxm-error-boundary" style={{ padding: '1.5rem' }}>
        <ErrorNotice
          variant="page"
          title={this.props.fallbackTitle ?? '页面出了点问题'}
          resolved={{
            code: 'INTERNAL_ERROR',
            message: '请刷新页面后重试；若问题持续，请稍后再试或联系管理员。',
            retryable: true,
            debugDetail,
          }}
          isAdmin={isAdmin}
          actionLabel="刷新页面"
          onAction={this.handleReload}
        />
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Button type="link" size="small" onClick={this.handleReset}>
            尝试恢复
          </Button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
