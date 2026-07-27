export type BubbleTone = 'writing' | 'image' | 'audio' | 'music' | 'video' | 'agent';

type BusinessBubbleProps = {
  label: string;
  tone: BubbleTone;
};

/** iOS 风格 frosted pill */
export function BusinessBubble({ label, tone }: BusinessBubbleProps) {
  return (
    <span className={`dv-bubble dv-bubble--${tone}`}>
      <span className="dv-bubble__shine" aria-hidden />
      <span className="dv-bubble__label">{label}</span>
    </span>
  );
}
