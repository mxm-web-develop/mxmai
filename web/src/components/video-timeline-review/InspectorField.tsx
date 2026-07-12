import type { ReactNode } from 'react';
import { PageHint } from '../PageHint';

type InspectorFieldProps = {
  label: string;
  tip?: { title: string; description?: ReactNode };
  children: ReactNode;
  className?: string;
};

export function InspectorField({ label, tip, children, className }: InspectorFieldProps) {
  return (
    <div className={`video-timeline-review__field${className ? ` ${className}` : ''}`}>
      <div className="video-timeline-review__field-label">
        <span>{label}</span>
        {tip ? (
          <PageHint title={tip.title} description={tip.description} placement="left" />
        ) : null}
      </div>
      <div className="video-timeline-review__field-control">{children}</div>
    </div>
  );
}
