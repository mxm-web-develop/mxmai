import type { GridCellSlot } from './types';

export type PoseScriptEntry = {
  slots: GridCellSlot;
  directiveEn: string;
};

/** 平台默认：电商商拍格位脚本（英文 directive，库内两两差异化） */
const DEFAULT_SCRIPTS: Record<string, PoseScriptEntry[]> = {
  '2x2': [
    {
      slots: {
        pose: 'standing_three_quarter',
        framing: 'full_body',
        shotType: 'establishing',
        action: 'natural_stride_mid_step',
        lens: '28mm_equivalent',
      },
      directiveEn:
        'Full-body establishing shot, model mid-step with natural stride, three-quarter angle, ~28mm equivalent eye-level, showing dress length and environment context.',
    },
    {
      slots: {
        pose: 'standing_torso_twist',
        framing: 'half_body',
        shotType: 'hero_sell',
        action: 'hand_adjusting_collar',
        lens: '65mm_equivalent',
      },
      directiveEn:
        'Half-body hero framing from waist up, subtle torso twist, one hand lightly adjusting collar or neckline, ~65mm equivalent, moderate depth of field on garment lines.',
    },
    {
      slots: {
        pose: 'seated_side',
        framing: 'three_quarter_body',
        shotType: 'skirt_flow',
        action: 'hands_smoothing_skirt',
        lens: '50mm_equivalent',
      },
      directiveEn:
        'Seated three-quarter view on bench or steps, hands smoothing skirt hem to show drape, ~50mm equivalent, seated camera height ~15 degrees above eye line.',
    },
    {
      slots: {
        pose: 'back_three_quarter',
        framing: 'full_body_back',
        shotType: 'back_detail',
        action: 'glance_over_shoulder',
        lens: '35mm_equivalent',
      },
      directiveEn:
        'Back three-quarter full-body view, glance over shoulder, highlight back panel and skirt movement, ~35mm equivalent, distinct from front-facing panels.',
    },
    {
      slots: {
        pose: 'walking_away_turn',
        framing: 'full_body',
        shotType: 'motion',
        action: 'turn_in_stride',
        lens: '32mm_equivalent',
      },
      directiveEn:
        'Full-body walking away then turning in stride toward camera, 32mm equivalent, dynamic hem swing, different from static standing panels.',
    },
    {
      slots: {
        pose: 'lean_forward',
        framing: 'half_body',
        shotType: 'neckline',
        action: 'both_hands_on_belt',
        lens: '75mm_equivalent',
      },
      directiveEn:
        'Half-body leaning slightly forward, both hands resting on belt line, 75mm equivalent, emphasize waist seam and buttons.',
    },
    {
      slots: {
        pose: 'kneel_one_knee',
        framing: 'three_quarter',
        shotType: 'hem_detail',
        action: 'pinch_fabric',
        lens: '55mm_equivalent',
      },
      directiveEn:
        'One-knee kneel, pinch fabric at hem to show weight and drape, 55mm equivalent, low camera near knee height.',
    },
    {
      slots: {
        pose: 'profile_walk',
        framing: 'full_body_profile',
        shotType: 'silhouette',
        action: 'profile_gaze_off_camera',
        lens: '40mm_equivalent',
      },
      directiveEn:
        'Clean profile full-body walking freeze, gaze off-camera, 40mm equivalent, strong silhouette readable against background.',
    },
  ],
  '3x3': [
    {
      slots: { pose: 'walk', framing: 'full', shotType: 'establishing', action: 'stride', lens: '28mm' },
      directiveEn: 'Full-body walking establishing, 28mm equivalent, distinct stride and gaze forward.',
    },
    {
      slots: { pose: 'stand', framing: 'half', shotType: 'hero', action: 'bag_strap', lens: '70mm' },
      directiveEn: 'Half-body with handbag strap on shoulder, 70mm equivalent, sell waist and bodice lines.',
    },
    {
      slots: { pose: 'sit', framing: 'three_quarter', shotType: 'skirt', action: 'fold_fabric', lens: '50mm' },
      directiveEn: 'Seated three-quarter, hands on fabric fold at knee, 50mm equivalent.',
    },
    {
      slots: { pose: 'back', framing: 'full', shotType: 'back', action: 'over_shoulder', lens: '35mm' },
      directiveEn: 'Back full-body over-shoulder glance, 35mm equivalent.',
    },
    {
      slots: { pose: 'detail', framing: 'close', shotType: 'fabric', action: 'texture', lens: '100mm' },
      directiveEn: 'Close-up fabric texture at bodice, 100mm macro-style, shallow DoF but stitch lines readable.',
    },
    {
      slots: { pose: 'stand', framing: 'half', shotType: 'sleeve', action: 'cuff', lens: '85mm' },
      directiveEn: 'Medium close on sleeve cuff and button placket, 85mm equivalent.',
    },
    {
      slots: { pose: 'lean', framing: 'full', shotType: 'environment', action: 'railing', lens: '30mm' },
      directiveEn: 'Full-body leaning on railing, 30mm environmental context, different hand placement.',
    },
    {
      slots: { pose: 'sit_low', framing: 'full', shotType: 'hem', action: 'hem_spread', lens: '40mm' },
      directiveEn: 'Low seated pose spreading hem on ground, 40mm slight high angle.',
    },
    {
      slots: { pose: 'profile', framing: 'half', shotType: 'profile', action: 'chin_up', lens: '60mm' },
      directiveEn: 'Clean profile half-body, chin slightly up, 60mm equivalent, distinct silhouette.',
    },
  ],
  '4x4': Array.from({ length: 16 }, (_, i) => ({
    slots: {
      pose: `variant_${i + 1}`,
      framing: i % 4 === 0 ? 'full' : i % 4 === 1 ? 'half' : i % 4 === 2 ? 'detail' : 'three_quarter',
      shotType: `panel_${i + 1}`,
      action: `action_${i + 1}`,
      lens: `${50 + (i % 5) * 10}mm`,
    },
    directiveEn: `Panel variant ${i + 1}: distinct pose and framing combination ${i + 1}, unique hand gesture and camera height, no duplicate of other panels.`,
  })),
};

export function loadScriptsFromSchema(
  formSchema?: { properties?: Record<string, unknown> }
): Record<string, PoseScriptEntry[]> | null {
  const fs = formSchema as Record<string, unknown> | undefined;
  if (!fs) return null;
  const fromRoot = fs['x-grid-pose-scripts'];
  if (fromRoot && typeof fromRoot === 'object') {
    return parseScriptMap(fromRoot as Record<string, unknown>);
  }
  return null;
}

/** 纯字符串脚本池条目须带可区分 slots，否则文案门禁会误判 6 对冲突 */
function slotsForPoolIndex(index: number): GridCellSlot {
  const framings = ['full_body', 'half_body', 'three_quarter', 'full_body_back', 'full_body_motion', 'half_lean', 'kneel_detail', 'profile_walk'];
  const shotTypes = ['establishing', 'hero_sell', 'skirt_flow', 'back_detail', 'motion', 'waist_hero', 'hem_detail', 'silhouette'];
  const actions = ['stride', 'adjust_collar', 'smooth_skirt', 'over_shoulder', 'turn_stride', 'hands_belt', 'pinch_hem', 'gaze_off'];
  return {
    pose: `pool_pose_${index}`,
    framing: framings[index % framings.length],
    shotType: shotTypes[index % shotTypes.length],
    action: actions[index % actions.length],
  };
}

function parseScriptMap(raw: Record<string, unknown>): Record<string, PoseScriptEntry[]> | null {
  const out: Record<string, PoseScriptEntry[]> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!Array.isArray(val)) continue;
    const entries: PoseScriptEntry[] = [];
    for (const item of val) {
      if (typeof item === 'string' && item.trim()) {
        const idx = entries.length;
        entries.push({
          slots: slotsForPoolIndex(idx),
          directiveEn: item.trim(),
        });
      } else if (item && typeof item === 'object' && typeof (item as PoseScriptEntry).directiveEn === 'string') {
        const entry = item as PoseScriptEntry;
        entries.push({
          ...entry,
          slots: entry.slots?.pose && entry.slots.pose !== 'custom'
            ? entry.slots
            : slotsForPoolIndex(entries.length),
        });
      }
    }
    if (entries.length > 0) out[key.toLowerCase()] = entries;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function getScriptPool(
  outputGrid: string,
  formSchema?: { properties?: Record<string, unknown> }
): PoseScriptEntry[] {
  const key = outputGrid.toLowerCase();
  const fromSchema = loadScriptsFromSchema(formSchema);
  if (fromSchema?.[key]?.length) return fromSchema[key];
  return DEFAULT_SCRIPTS[key] ?? DEFAULT_SCRIPTS['2x2'];
}

export function pickScriptsForGrid(args: {
  outputGrid: string;
  totalCells: number;
  parallelIndex: number;
  formSchema?: { properties?: Record<string, unknown> };
}): PoseScriptEntry[] {
  const pool = getScriptPool(args.outputGrid, args.formSchema);
  const { totalCells, parallelIndex } = args;
  const offset = parallelIndex * totalCells;
  const picked: PoseScriptEntry[] = [];
  for (let i = 0; i < totalCells; i++) {
    picked.push(pool[(offset + i) % pool.length]);
  }
  return picked;
}
