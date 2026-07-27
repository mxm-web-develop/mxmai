import type { JsonSchemaProperty, PublishedApiManifest } from '@/adapters/types';
import { normalizeManifestForH5Ui } from '@/lib/enum-display';
import { PUBLISHED_OPEN_API_SLUGS as S } from './published-slugs';

import graphWomen from '@/fixtures/manifests/graph-eshop-clothes-women.json';
import graphMen from '@/fixtures/manifests/graph-eshop-clothes-men.json';
import graphKids from '@/fixtures/manifests/graph-eshop-clothes-kids.json';
import graphHd from '@/fixtures/manifests/graph-tools-hd.json';
import eshopPost from '@/fixtures/manifests/eshop-post.json';
import eshopSolution from '@/fixtures/manifests/eshop-solution.json';
import eshopVedio from '@/fixtures/manifests/eshop-vedio.json';

function withSlug(manifest: PublishedApiManifest, slug: string): PublishedApiManifest {
  return { ...manifest, slug };
}

/** 本地 formSchema 兜底（HTTP 下优先拉平台 GET /api/v1/open/:slug） */
const MANIFESTS: Record<string, PublishedApiManifest> = {
  [S.womenOutfits]: withSlug(graphWomen as unknown as PublishedApiManifest, S.womenOutfits),
  [S.menOutfits]: withSlug(graphMen as unknown as PublishedApiManifest, S.menOutfits),
  [S.kidsOutfits]: withSlug(graphKids as unknown as PublishedApiManifest, S.kidsOutfits),
  [S.poster]: withSlug(eshopPost as unknown as PublishedApiManifest, S.poster),
  [S.toolsHd]: withSlug(graphHd as unknown as PublishedApiManifest, S.toolsHd),
  [S.smartflowSuite]: withSlug(eshopSolution as unknown as PublishedApiManifest, S.smartflowSuite),
  [S.clothesVideo]: withSlug(eshopVedio as unknown as PublishedApiManifest, S.clothesVideo),
};

export function getLocalManifestBySlug(slug: string): PublishedApiManifest | null {
  return MANIFESTS[slug] ?? null;
}

export function getManifestBySlug(slug: string): PublishedApiManifest {
  const m = MANIFESTS[slug];
  if (!m) throw new Error(`未找到 manifest：${slug}（请确认 Admin 已发布且 slug 与 catalog 一致）`);
  return normalizeManifestForH5Ui(m);
}

export function listManifestSlugs(): string[] {
  return Object.keys(MANIFESTS);
}

/** Open API 常不下发 x-enum-labels，用本地 formSchema 补 UI 中文标签 */
export function enrichManifestWithLocalUi(remote: PublishedApiManifest): PublishedApiManifest {
  const local = getLocalManifestBySlug(remote.slug);
  if (!local) return normalizeManifestForH5Ui(remote);

  const remoteProps = remote.inputSchema.properties ?? {};
  const localProps = local.inputSchema.properties ?? {};
  const merged: Record<string, JsonSchemaProperty> = {};

  for (const key of new Set([...Object.keys(remoteProps), ...Object.keys(localProps)])) {
    const r = remoteProps[key];
    const l = localProps[key];
    if (!r) {
      if (l) merged[key] = l;
      continue;
    }
    if (!l) {
      merged[key] = r;
      continue;
    }
    merged[key] = {
      ...l,
      ...r,
      enum: r.enum ?? l.enum,
      default: r.default !== undefined ? r.default : l.default,
      title: r.title ?? l.title,
      description: r.description ?? l.description,
      'x-enum-labels':
        r['x-enum-labels']?.length ? r['x-enum-labels'] : l['x-enum-labels'],
      'x-enum-descriptions':
        r['x-enum-descriptions'] && Object.keys(r['x-enum-descriptions']).length > 0
          ? r['x-enum-descriptions']
          : l['x-enum-descriptions'],
    };
  }

  return normalizeManifestForH5Ui({
    ...remote,
    title: remote.title || local.title,
    description: remote.description ?? local.description,
    inputSchema: {
      ...remote.inputSchema,
      properties: merged,
      required: remote.inputSchema.required ?? local.inputSchema.required,
    },
    inputDoc: {
      ...local.inputDoc,
      ...remote.inputDoc,
      fieldHints: {
        ...local.inputDoc?.fieldHints,
        ...remote.inputDoc?.fieldHints,
      },
    },
  });
}
