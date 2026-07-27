import { PageHint } from './PageHint';
import { sanitizeReviewHint } from './manualReviewUserCopy';

type ManualReviewModalTitleProps = {
  title: string;
  hint?: string;
};

export function ManualReviewModalTitle({ title, hint }: ManualReviewModalTitleProps) {
  const description = sanitizeReviewHint(hint);
  return (
    <div className="manual-review-modal__title-row">
      <span className="manual-review-modal__title-text">{title}</span>
      {description ? (
        <PageHint title="操作说明" description={description} placement="bottomLeft" />
      ) : null}
    </div>
  );
}
