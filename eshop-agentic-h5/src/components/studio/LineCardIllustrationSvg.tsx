import type { GridShootLineId } from '@/catalog/grid-shoot-lines';

const PALETTE: Record<
  GridShootLineId,
  { stroke: string; fill: string; accent: string; soft: string }
> = {
  women: { stroke: '#9d5a6a', fill: '#e8a0b4', accent: '#c45c4a', soft: '#fce8ee' },
  men: { stroke: '#4a6d85', fill: '#7b9eb8', accent: '#5a7f9a', soft: '#e3edf5' },
  kids: { stroke: '#4a7a58', fill: '#8fbc9a', accent: '#6a9f78', soft: '#e2f0e6' },
};

function WomenArt({ colors }: { colors: (typeof PALETTE)['women'] }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden className="h-full w-full">
      <ellipse cx="88" cy="28" rx="32" ry="32" fill={colors.soft} opacity="0.9" />
      <path
        d="M58 18c8-6 18-6 26 0 6 4 8 12 6 20l-4 52c-1 8-8 14-16 14s-15-6-16-14l-4-52c-2-8 0-16 6-20z"
        fill={colors.fill}
        fillOpacity="0.35"
        stroke={colors.stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M52 38c-6 14-8 32-6 48 4 2 10 3 16 3s12-1 16-3c2-16 0-34-6-48"
        stroke={colors.accent}
        strokeWidth="1.2"
        strokeOpacity="0.5"
        fill="none"
      />
      <circle cx="71" cy="22" r="9" fill={colors.soft} stroke={colors.stroke} strokeWidth="1.2" />
      <path
        d="M38 72c-10 8-18 22-20 38"
        stroke={colors.fill}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function MenArt({ colors }: { colors: (typeof PALETTE)['men'] }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden className="h-full w-full">
      <ellipse cx="90" cy="30" rx="30" ry="30" fill={colors.soft} opacity="0.9" />
      <path
        d="M48 26h36l6 8-4 6H46l-4-6 6-8z"
        fill={colors.fill}
        fillOpacity="0.4"
        stroke={colors.stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M44 40h44v42c0 6-6 10-12 10H56c-6 0-12-4-12-10V40z"
        fill={colors.fill}
        fillOpacity="0.28"
        stroke={colors.stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M44 48h44" stroke={colors.accent} strokeWidth="1" strokeOpacity="0.45" />
      <path d="M66 40v52" stroke={colors.stroke} strokeWidth="1" strokeOpacity="0.35" />
      <circle cx="68" cy="20" r="8" fill={colors.soft} stroke={colors.stroke} strokeWidth="1.2" />
      <path
        d="M32 78l-8 28M92 78l8 28"
        stroke={colors.fill}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

function KidsArt({ colors }: { colors: (typeof PALETTE)['kids'] }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden className="h-full w-full">
      <ellipse cx="88" cy="32" rx="28" ry="28" fill={colors.soft} opacity="0.95" />
      <path
        d="M54 34h28c4 0 8 4 8 8v6H46v-6c0-4 4-8 8-8z"
        fill={colors.accent}
        fillOpacity="0.25"
        stroke={colors.stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <rect
        x="46"
        y="48"
        width="44"
        height="38"
        rx="8"
        fill={colors.fill}
        fillOpacity="0.32"
        stroke={colors.stroke}
        strokeWidth="1.5"
      />
      <circle cx="58" cy="58" r="3" fill={colors.accent} fillOpacity="0.5" />
      <circle cx="78" cy="58" r="3" fill={colors.accent} fillOpacity="0.5" />
      <path
        d="M58 68c4 4 10 4 14 0"
        stroke={colors.stroke}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M72 22l4 6 7 1-5 5 1 7-7-4-7 4 1-7-5-5 7-1 4-6z"
        fill={colors.accent}
        fillOpacity="0.35"
        stroke={colors.stroke}
        strokeWidth="0.8"
      />
      <circle cx="68" cy="18" r="7" fill={colors.soft} stroke={colors.stroke} strokeWidth="1.1" />
    </svg>
  );
}

const ART: Record<GridShootLineId, typeof WomenArt> = {
  women: WomenArt,
  men: MenArt,
  kids: KidsArt,
};

export function LineCardIllustrationSvg({ lineId }: { lineId: GridShootLineId }) {
  const colors = PALETTE[lineId];
  const Art = ART[lineId];
  return <Art colors={colors} />;
}
