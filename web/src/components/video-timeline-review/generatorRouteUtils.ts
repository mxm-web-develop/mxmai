import { formatGeneratorRouteValue, parseGeneratorRouteValue, type VideoGeneratorOption } from './types';

const LEGACY_GENERATOR_KEYS = new Set(['resource', 'storyboard', 'short', 'commercial']);

/** 与 mxmcgi video-business-category.normalizeVideoGeneratorRoute 对齐 */
export function normalizeVideoGeneratorRoute(
  taskKey?: string,
  subtype?: string | null
): { taskKey: string; subtype: string | null } {
  const rawKey = taskKey?.trim() || 'generator';
  const rawSub = subtype?.trim() || 'fragment';

  if (rawKey === 'generator' || rawKey === 'autocut') {
    return { taskKey: rawKey, subtype: rawSub || null };
  }
  if (rawKey === 'resource') {
    return { taskKey: 'generator', subtype: rawSub || 'fragment' };
  }
  if (LEGACY_GENERATOR_KEYS.has(rawKey)) {
    return { taskKey: 'generator', subtype: rawSub || null };
  }
  if (rawKey === 'edit') {
    return { taskKey: 'autocut', subtype: rawSub || null };
  }
  return { taskKey: rawKey, subtype: rawSub || null };
}

export function resolveGeneratorRouteValue(taskKey?: string, subtype?: string | null): string {
  const normalized = normalizeVideoGeneratorRoute(taskKey, subtype);
  return formatGeneratorRouteValue(normalized.taskKey, normalized.subtype);
}

export function resolveGeneratorLabel(
  routeValue: string,
  options: VideoGeneratorOption[]
): string {
  const parsed = parseGeneratorRouteValue(routeValue);
  const normalized = resolveGeneratorRouteValue(parsed.taskKey, parsed.subtype);
  const found = options.find(
    (o) => formatGeneratorRouteValue(o.taskKey, o.subtype) === normalized
  );
  if (found) return found.label;

  const { taskKey, subtype } = parseGeneratorRouteValue(normalized);
  return subtype ? `${taskKey}/${subtype}` : taskKey;
}
