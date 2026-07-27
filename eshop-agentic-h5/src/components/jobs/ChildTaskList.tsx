'use client';

import type { JobChildTask } from '@/adapters/types';
import { cn } from '@/lib/cn';

export function ChildTaskList({ children }: { children: JobChildTask[] }) {
  if (!children.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-muted">子任务进度</p>
      {children.map((child) => (
        <div key={child.id} className="rounded-lg bg-surface-elevated p-3">
          <div className="flex items-center justify-between text-sm">
            <span>{child.label}</span>
            <span className="text-text-muted">{child.progress}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                child.status === 'completed' ? 'bg-success' : 'bg-accent-coral'
              )}
              style={{ width: `${child.progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
