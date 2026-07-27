import { RepositoryFactory, type AppLocale } from '@mxmai/mxmdata';
import type { Folder, FolderAssetRole, FolderCardTag } from '@mxmai/mxmdata';
import { KnowledgeService } from '../knowledge/knowledge-service';
import {
  assertVirtualFolder,
  contentHashForResolved,
  resolveFolderItemRefs,
  type ResolvedRef,
} from './folder-content-resolver';
import { assetRoleFromUseAs, captionImages, type ImageAnalysis } from './folder-image-caption';
import { extractVoiceIdFromText } from './extract-voice-id';
import {
  isStyleVisionObj,
  type StylePackSummary,
  type StyleVisionObj,
} from './style-vision-types';
import {
  runVfStyleFrameFromImage,
  runVfStyleFrameFromText,
  runVfStylePack,
} from './vf-style-pack-runner';
import {
  isWritingStyleObj,
  type WritingStyleObj,
  type WritingStylePackSummary,
} from './writing-style-types';
import {
  runVfWritingFrameFromText,
  runVfWritingPack,
} from './vf-writing-style-pack-runner';
import { runVfCharacterPack } from './vf-character-pack-runner';
import {
  isCharacterPackSummary,
  type CharacterPackSummary,
} from './character-vision-types';

const indexingJobs = new Map<string, Promise<void>>();

function refKey(ref: { ref_type: string; ref_id: string }): string {
  return `${ref.ref_type}:${ref.ref_id}`;
}

export class VirtualFolderIndexService {
  private folderRepo = RepositoryFactory.createFolderRepository();
  private knowledgeService = new KnowledgeService();

  /**
   * 普通夹（无 card_tag）默认不解析。
   * 有 card_tag 时按标签分流解析；force 可强制重跑。
   */
  async startIndex(
    userId: string,
    folderId: string,
    force = false,
    userLang: AppLocale = 'zh'
  ): Promise<void> {
    const folder = await assertVirtualFolder(folderId, userId);
    if (!folder.card_tag && !force) {
      throw new Error(
        '普通虚拟文件夹默认不解析。请先打标（视觉风格/语感文风/角色/知识），或使用强制解析。'
      );
    }

    const existing = indexingJobs.get(folderId);
    if (existing) {
      await existing;
      return;
    }

    await this.folderRepo.updateFolderIndex(userId, folderId, {
      index_status: 'indexing',
      index_error: null,
      card_status: folder.card_tag ? 'parsing' : undefined,
    });

    const job = this.runIndex(userId, folderId, force, userLang).finally(() => {
      indexingJobs.delete(folderId);
    });
    indexingJobs.set(folderId, job);
    await job;
  }

  async startParse(
    userId: string,
    folderId: string,
    force = false,
    userLang: AppLocale = 'zh'
  ): Promise<void> {
    return this.startIndex(userId, folderId, force, userLang);
  }

  private async runIndex(
    userId: string,
    folderId: string,
    force: boolean,
    userLang: AppLocale
  ): Promise<void> {
    try {
      const folder = await assertVirtualFolder(folderId, userId);
      const cardTag = folder.card_tag ?? null;

      if (cardTag === 'style') {
        await this.runStylePackIndex(userId, folderId, folder, force, userLang);
        return;
      }

      if (cardTag === 'writing') {
        await this.runWritingStylePackIndex(userId, folderId, folder, force, userLang);
        return;
      }

      if (cardTag === 'character') {
        await this.runCharacterPackIndex(userId, folderId, folder, force, userLang);
        return;
      }

      await this.runLegacyCardIndex(userId, folderId, folder, cardTag, force, userLang);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.folderRepo.updateFolderIndex(userId, folderId, {
        index_status: 'none',
        index_error: msg,
        card_status: 'failed',
      });
      throw e;
    }
  }

  /** 视觉风格卡：增量 frame（text 业务）+ 一次 pack 汇总。不做 embedding（省 token；业务吃 card_summary）。 */
  private async runStylePackIndex(
    userId: string,
    folderId: string,
    folder: Folder,
    force: boolean,
    userLang: AppLocale
  ): Promise<void> {
    const refs = await resolveFolderItemRefs(folderId, userId);
    const items = await this.folderRepo.getFolderItems(folderId);
    const itemByRef = new Map<string, (typeof items)[0]>();
    for (const it of items) {
      if (it.task_id) itemByRef.set(`task:${it.task_id}`, it);
      if (it.storage_object_id) itemByRef.set(`storage_object:${it.storage_object_id}`, it);
    }

    const activeRefs: Array<{ ref_type: 'task' | 'storage_object'; ref_id: string }> = [];
    const frames: StyleVisionObj[] = [];
    const urlByRefKey = new Map<string, string>();

    for (const ref of refs) {
      activeRefs.push({ ref_type: ref.ref_type, ref_id: ref.ref_id });
      const folderItem = itemByRef.get(refKey(ref));

      if (ref.skipReason && !ref.textContent && !ref.imageBuffers?.length) {
        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          status: 'skipped',
          error_message: ref.skipReason,
          chunk_count: 0,
        });
        continue;
      }

      try {
        const hash = contentHashForResolved(ref, [
          ref.textContent || '',
          String(ref.imageBuffers?.length ?? 0),
        ]);
        const entries = await this.folderRepo.getFolderIndexEntries(folderId);
        const prev = entries.find((e) => e.ref_type === ref.ref_type && e.ref_id === ref.ref_id);
        const mediaUrl = await this.resolveMediaUrl(ref);
        if (mediaUrl) urlByRefKey.set(refKey(ref), mediaUrl);

        if (!force && prev?.content_hash === hash && prev.status === 'indexed' && prev.analysis) {
          if (isStyleVisionObj(prev.analysis)) {
            frames.push({
              ...prev.analysis,
              media_url: mediaUrl ?? prev.analysis.media_url,
              title: ref.title,
              ref_type: ref.ref_type,
              ref_id: ref.ref_id,
            });
          }
          continue;
        }

        let vision: StyleVisionObj | null = null;
        if (ref.imageBuffers && ref.imageBuffers.length > 0) {
          const img = ref.imageBuffers[0];
          vision = await runVfStyleFrameFromImage(userId, {
            buffer: img.buffer,
            mimeType: img.mimeType,
            title: ref.title,
            userLang,
          });
        } else if (ref.textContent?.trim()) {
          vision = await runVfStyleFrameFromText(userId, {
            designText: ref.textContent,
            title: ref.title,
            userLang,
          });
        }

        if (!vision) {
          await this.folderRepo.upsertFolderIndexEntry(folderId, {
            ref_type: ref.ref_type,
            ref_id: ref.ref_id,
            content_hash: hash,
            status: 'skipped',
            error_message: '无可用图像或设计文案（PDF 等暂未接入）',
            chunk_count: 0,
          });
          continue;
        }

        const analysisPayload: StyleVisionObj = {
          ...vision,
          media_url: mediaUrl ?? undefined,
          title: ref.title,
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
        };
        frames.push(analysisPayload);

        if (folderItem && (!folderItem.asset_role || folderItem.asset_role === 'unknown')) {
          try {
            await this.folderRepo.updateFolderItemAssetRole(folderId, folderItem.id, 'style_ref');
          } catch (e) {
            console.warn('[VirtualFolderIndex] update asset_role failed', e);
          }
        }

        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          content_hash: hash,
          status: 'indexed',
          chunk_count: 0,
          indexed_at: new Date().toISOString(),
          analysis: analysisPayload as unknown as Record<string, unknown>,
        });
      } catch (e) {
        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          status: 'failed',
          error_message: e instanceof Error ? e.message : String(e),
          chunk_count: 0,
        });
      }
    }

    await this.folderRepo.deleteFolderIndexEntriesNotIn(folderId, activeRefs);

    if (frames.length === 0) {
      await this.folderRepo.updateFolderIndex(userId, folderId, {
        index_status: 'indexed',
        indexed_at: new Date().toISOString(),
        index_error: null,
        card_status: 'ready',
        card_summary: {
          style: {
            schema_version: 1,
            style_summary: folder.name,
            palettes: [],
            exemplar_ref_ids: [],
            exemplar_urls: [],
            exemplars: [],
            frame_count: 0,
            palette: [],
            donts: [],
          },
        },
      });
      return;
    }

    const pack = await runVfStylePack(userId, {
      folderName: folder.name,
      frames,
      userLang,
    });

    // 用 url 地图补齐 exemplars（normalize 已选 Top5）
    const exemplars = (pack.exemplars ?? []).map((e) => {
      const url = e.url || urlByRefKey.get(e.ref_key);
      return url ? { ...e, url } : e;
    });
    const exemplar_urls = exemplars
      .map((e) => e.url)
      .filter((u): u is string => typeof u === 'string' && !!u);
    const styleSummary: StylePackSummary = {
      ...pack,
      exemplars,
      exemplar_ref_ids: exemplars.map((e) => e.ref_key),
      exemplar_urls,
      donts: pack.avoid ?? pack.donts,
      palette: pack.palette ?? [],
    };

    await this.folderRepo.updateFolderIndex(userId, folderId, {
      index_status: 'indexed',
      indexed_at: new Date().toISOString(),
      index_error: null,
      card_status: 'ready',
      card_summary: { style: styleSummary },
    });
  }

  /**
   * 语感文风卡：增量 frame（text 业务）+ 一次 pack 汇总。
   * 只吃文章正文（txt/md/写作任务）；图片与 PDF 当前 skip。不做 embedding。
   */
  private async runWritingStylePackIndex(
    userId: string,
    folderId: string,
    folder: Folder,
    force: boolean,
    userLang: AppLocale
  ): Promise<void> {
    const refs = await resolveFolderItemRefs(folderId, userId);
    const items = await this.folderRepo.getFolderItems(folderId);
    const itemByRef = new Map<string, (typeof items)[0]>();
    for (const it of items) {
      if (it.task_id) itemByRef.set(`task:${it.task_id}`, it);
      if (it.storage_object_id) itemByRef.set(`storage_object:${it.storage_object_id}`, it);
    }

    const activeRefs: Array<{ ref_type: 'task' | 'storage_object'; ref_id: string }> = [];
    const frames: WritingStyleObj[] = [];

    for (const ref of refs) {
      activeRefs.push({ ref_type: ref.ref_type, ref_id: ref.ref_id });
      const folderItem = itemByRef.get(refKey(ref));

      if (ref.skipReason && !ref.textContent?.trim()) {
        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          status: 'skipped',
          error_message: ref.skipReason,
          chunk_count: 0,
        });
        continue;
      }

      if (!ref.textContent?.trim()) {
        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          status: 'skipped',
          error_message: '语感文风卡仅支持文章正文（txt/md/写作任务）；图片与 PDF 暂未接入',
          chunk_count: 0,
        });
        continue;
      }

      try {
        const hash = contentHashForResolved(ref, [ref.textContent]);
        const entries = await this.folderRepo.getFolderIndexEntries(folderId);
        const prev = entries.find((e) => e.ref_type === ref.ref_type && e.ref_id === ref.ref_id);

        if (!force && prev?.content_hash === hash && prev.status === 'indexed' && prev.analysis) {
          if (isWritingStyleObj(prev.analysis)) {
            frames.push({
              ...prev.analysis,
              title: ref.title,
              ref_type: ref.ref_type,
              ref_id: ref.ref_id,
            });
          }
          continue;
        }

        const vision = await runVfWritingFrameFromText(userId, {
          articleText: ref.textContent,
          title: ref.title,
          userLang,
        });

        const analysisPayload: WritingStyleObj = {
          ...vision,
          title: ref.title,
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
        };
        frames.push(analysisPayload);

        if (folderItem && (!folderItem.asset_role || folderItem.asset_role === 'unknown')) {
          try {
            await this.folderRepo.updateFolderItemAssetRole(folderId, folderItem.id, 'description');
          } catch (e) {
            console.warn('[VirtualFolderIndex] update asset_role failed', e);
          }
        }

        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          content_hash: hash,
          status: 'indexed',
          chunk_count: 0,
          indexed_at: new Date().toISOString(),
          analysis: analysisPayload as unknown as Record<string, unknown>,
        });
      } catch (e) {
        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          status: 'failed',
          error_message: e instanceof Error ? e.message : String(e),
          chunk_count: 0,
        });
      }
    }

    await this.folderRepo.deleteFolderIndexEntriesNotIn(folderId, activeRefs);

    if (frames.length === 0) {
      await this.folderRepo.updateFolderIndex(userId, folderId, {
        index_status: 'indexed',
        indexed_at: new Date().toISOString(),
        index_error: null,
        card_status: 'ready',
        card_summary: {
          writing: {
            schema_version: 1,
            voice_summary: folder.name,
            exemplar_ref_ids: [],
            exemplars: [],
            frame_count: 0,
          },
        },
      });
      return;
    }

    const pack = await runVfWritingPack(userId, {
      folderName: folder.name,
      frames,
      userLang,
    });

    const writingSummary: WritingStylePackSummary = {
      ...pack,
      exemplars: pack.exemplars ?? [],
      exemplar_ref_ids: (pack.exemplars ?? []).map((e) => e.ref_key),
    };

    await this.folderRepo.updateFolderIndex(userId, folderId, {
      index_status: 'indexed',
      indexed_at: new Date().toISOString(),
      index_error: null,
      card_status: 'ready',
      card_summary: { writing: writingSummary },
    });
  }

  /**
   * 角色卡：整夹一次 text 业务（多模态）。不做 embedding；不做逐图 frame。
   * 再解析时保留 user provenance 字段。
   */
  private async runCharacterPackIndex(
    userId: string,
    folderId: string,
    folder: Folder,
    force: boolean,
    userLang: AppLocale
  ): Promise<void> {
    const refs = await resolveFolderItemRefs(folderId, userId);
    const items = await this.folderRepo.getFolderItems(folderId);
    const itemByRef = new Map<string, (typeof items)[0]>();
    for (const it of items) {
      if (it.task_id) itemByRef.set(`task:${it.task_id}`, it);
      if (it.storage_object_id) itemByRef.set(`storage_object:${it.storage_object_id}`, it);
    }

    const activeRefs: Array<{ ref_type: 'task' | 'storage_object'; ref_id: string }> = [];
    const urlByRefKey = new Map<string, string>();
    const dossierParts: string[] = [];
    const images: Array<{
      ref_key: string;
      buffer: Buffer;
      mimeType: string;
      title?: string;
      preferAppearance: boolean;
    }> = [];
    const assetManifest: Array<{ ref_key: string; kind: 'image' | 'text'; title?: string }> = [];
    let voiceId: string | undefined;

    const prevSummary = (folder.card_summary as { character?: unknown } | null)?.character;
    const previous =
      prevSummary && isCharacterPackSummary(prevSummary) ? prevSummary : null;

    for (const ref of refs) {
      activeRefs.push({ ref_type: ref.ref_type, ref_id: ref.ref_id });
      const key = refKey(ref);
      const folderItem = itemByRef.get(key);
      const mediaUrl = await this.resolveMediaUrl(ref);
      if (mediaUrl) urlByRefKey.set(key, mediaUrl);

      if (ref.skipReason && !ref.textContent && !ref.imageBuffers?.length) {
        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          status: 'skipped',
          error_message: ref.skipReason,
          chunk_count: 0,
        });
        continue;
      }

      try {
        const hash = contentHashForResolved(ref, [
          ref.textContent || '',
          String(ref.imageBuffers?.length ?? 0),
        ]);

        if (ref.textContent?.trim()) {
          dossierParts.push(
            `[${ref.title || key}]\n${ref.textContent.trim()}`.slice(0, 40000)
          );
          assetManifest.push({ ref_key: key, kind: 'text', title: ref.title });
          const vid = extractVoiceIdFromText(ref.textContent);
          if (vid && !voiceId) voiceId = vid;
        }

        if (ref.imageBuffers && ref.imageBuffers.length > 0) {
          const img = ref.imageBuffers[0];
          const preferAppearance =
            folderItem?.asset_role === 'appearance' ||
            folderItem?.asset_role === 'unknown' ||
            !folderItem?.asset_role;
          images.push({
            ref_key: key,
            buffer: img.buffer,
            mimeType: img.mimeType,
            title: ref.title,
            preferAppearance,
          });
          assetManifest.push({ ref_key: key, kind: 'image', title: ref.title });

          if (folderItem && (!folderItem.asset_role || folderItem.asset_role === 'unknown')) {
            try {
              await this.folderRepo.updateFolderItemAssetRole(folderId, folderItem.id, 'appearance');
            } catch (e) {
              console.warn('[VirtualFolderIndex] update asset_role failed', e);
            }
          }
        }

        if (!ref.textContent?.trim() && !(ref.imageBuffers && ref.imageBuffers.length > 0)) {
          await this.folderRepo.upsertFolderIndexEntry(folderId, {
            ref_type: ref.ref_type,
            ref_id: ref.ref_id,
            content_hash: hash,
            status: 'skipped',
            error_message: '无可用图像或文案（PDF 等暂未接入）',
            chunk_count: 0,
          });
          continue;
        }

        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          content_hash: hash,
          status: 'indexed',
          chunk_count: 0,
          indexed_at: new Date().toISOString(),
          analysis: {
            kind: 'character_asset',
            title: ref.title,
            has_image: !!(ref.imageBuffers && ref.imageBuffers.length > 0),
            has_text: !!ref.textContent?.trim(),
          },
        });
      } catch (e) {
        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          status: 'failed',
          error_message: e instanceof Error ? e.message : String(e),
          chunk_count: 0,
        });
      }
    }

    await this.folderRepo.deleteFolderIndexEntriesNotIn(folderId, activeRefs);

    if (assetManifest.length === 0) {
      await this.folderRepo.updateFolderIndex(userId, folderId, {
        index_status: 'indexed',
        indexed_at: new Date().toISOString(),
        index_error: null,
        card_status: 'ready',
        card_summary: {
          character: {
            schema_version: 1,
            display_name: { value: folder.name, provenance: 'inferred' },
            character_brief: `${folder.name}. Add portraits or a character dossier, then re-parse.`,
            appearance_prompt: `Consistent identity for ${folder.name}.`,
            media_assets: [],
            appearance_ref_ids: [],
            appearance_image_urls: [],
            asset_count: 0,
            description: `${folder.name}. Add portraits or a character dossier, then re-parse.`,
          },
        },
      });
      return;
    }

    // 优先 appearance 角色图；否则按顺序截断送入 vision
    const rankedImages = [
      ...images.filter((i) => i.preferAppearance),
      ...images.filter((i) => !i.preferAppearance),
    ];

    const pack = await runVfCharacterPack(userId, {
      folderName: folder.name,
      dossierText: dossierParts.join('\n\n---\n\n'),
      images: rankedImages,
      assetManifest,
      previous, // 保留 user provenance；force 仍尊重用户手改
      urlByRefKey,
      userLang,
    });

    if (voiceId && !pack.voice_id) pack.voice_id = voiceId;

    // 补全 URL
    pack.media_assets = pack.media_assets.map((m) => {
      const url = m.url || urlByRefKey.get(m.ref_key);
      return url ? { ...m, url } : m;
    });
    pack.appearance_image_urls = pack.appearance_ref_ids
      .map((id) => pack.media_assets.find((m) => m.ref_key === id)?.url || urlByRefKey.get(id))
      .filter((u): u is string => typeof u === 'string' && !!u)
      .slice(0, 10);
    pack.description = pack.character_brief;

    await this.folderRepo.updateFolderIndex(userId, folderId, {
      index_status: 'indexed',
      indexed_at: new Date().toISOString(),
      index_error: null,
      card_status: 'ready',
      card_summary: { character: pack },
    });
  }

  /** 知识卡（及无标签强制）：KB embedding；角色已分流 */
  private async runLegacyCardIndex(
    userId: string,
    folderId: string,
    folder: Folder,
    cardTag: FolderCardTag | null,
    force: boolean,
    userLang: AppLocale
  ): Promise<void> {
    const needsKb = cardTag === 'knowledge' || (!cardTag && force);
    const kbId = needsKb ? await this.ensureKnowledgeBase(folder, userId) : null;
    const refs = await resolveFolderItemRefs(folderId, userId);
    const items = await this.folderRepo.getFolderItems(folderId);
    const itemByRef = new Map<string, (typeof items)[0]>();
    for (const it of items) {
      if (it.task_id) itemByRef.set(`task:${it.task_id}`, it);
      if (it.storage_object_id) itemByRef.set(`storage_object:${it.storage_object_id}`, it);
    }

    const activeRefs: Array<{ ref_type: 'task' | 'storage_object'; ref_id: string }> = [];
    const collectedAnalyses: ImageAnalysis[] = [];
    const appearanceUrls: string[] = [];
    const styleRefUrls: string[] = [];
    let voiceId: string | undefined;
    const descriptionParts: string[] = [];

    for (const ref of refs) {
      activeRefs.push({ ref_type: ref.ref_type, ref_id: ref.ref_id });
      const folderItem = itemByRef.get(refKey(ref));

      if (ref.skipReason && !ref.textContent && !ref.imageBuffers?.length) {
        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          status: 'skipped',
          error_message: ref.skipReason,
          chunk_count: 0,
        });
        continue;
      }

      try {
        const imageResults =
          ref.imageBuffers && ref.imageBuffers.length > 0
            ? await captionImages(ref.imageBuffers, cardTag)
            : [];

        const captionTexts = imageResults.map((r) => r.text);
        const hash = contentHashForResolved(ref, captionTexts);
        const entries = await this.folderRepo.getFolderIndexEntries(folderId);
        const prev = entries.find((e) => e.ref_type === ref.ref_type && e.ref_id === ref.ref_id);
        if (!force && prev?.content_hash === hash && prev.status === 'indexed') {
          if (prev.analysis) {
            this.collectFromAnalysis(
              prev.analysis as unknown as ImageAnalysis & { media_url?: string },
              collectedAnalyses,
              appearanceUrls,
              styleRefUrls
            );
          }
          if (ref.textContent) {
            const vid = extractVoiceIdFromText(ref.textContent);
            if (vid) voiceId = voiceId || vid;
            if (cardTag === 'character') descriptionParts.push(ref.textContent);
          }
          continue;
        }

        for (const r of imageResults) {
          collectedAnalyses.push(r.analysis);
          const role = assetRoleFromUseAs(r.analysis.use_as) as FolderAssetRole;
          if (folderItem && (!folderItem.asset_role || folderItem.asset_role === 'unknown')) {
            try {
              await this.folderRepo.updateFolderItemAssetRole(folderId, folderItem.id, role);
            } catch (e) {
              console.warn('[VirtualFolderIndex] update asset_role failed', e);
            }
          }
        }

        if (ref.textContent) {
          const vid = extractVoiceIdFromText(ref.textContent);
          if (vid) voiceId = voiceId || vid;
          if (cardTag === 'character') {
            descriptionParts.push(ref.textContent);
            if (folderItem && (!folderItem.asset_role || folderItem.asset_role === 'unknown')) {
              try {
                await this.folderRepo.updateFolderItemAssetRole(
                  folderId,
                  folderItem.id,
                  vid ? 'voice' : 'description'
                );
              } catch {
                /* ignore */
              }
            }
          }
        }

        const mediaUrl = await this.resolveMediaUrl(ref);
        if (mediaUrl) {
          for (const r of imageResults) {
            if (r.analysis.use_as === 'identity' || cardTag === 'character') {
              appearanceUrls.push(mediaUrl);
            }
          }
        }

        const primaryAnalysis = imageResults[0]?.analysis;
        const analysisPayload = primaryAnalysis
          ? { ...primaryAnalysis, media_url: mediaUrl ?? undefined, title: ref.title }
          : ref.textContent
            ? {
                caption: ref.textContent.slice(0, 2000),
                style_summary: '',
                palette: [] as string[],
                use_as: 'doc' as const,
                voice_id: extractVoiceIdFromText(ref.textContent),
                media_url: mediaUrl ?? undefined,
                title: ref.title,
              }
            : null;

        const bodyText = [ref.textContent || '', ...captionTexts].filter(Boolean).join('\n\n');
        if (!bodyText.trim() && !analysisPayload) {
          await this.folderRepo.upsertFolderIndexEntry(folderId, {
            ref_type: ref.ref_type,
            ref_id: ref.ref_id,
            content_hash: hash,
            status: 'skipped',
            error_message: '无可用文本内容',
            chunk_count: 0,
          });
          continue;
        }

        let chunkCount = 0;
        if (kbId && bodyText.trim()) {
          const fileName = `vf-${folderId.slice(0, 8)}-${ref.ref_type}-${ref.ref_id}.txt`;
          const upload = await this.knowledgeService.uploadFileById({
            knowledgeBaseId: kbId,
            file: {
              buffer: Buffer.from(bodyText, 'utf-8'),
              originalname: fileName,
              mimetype: 'text/plain',
              size: Buffer.byteLength(bodyText),
            },
            userId,
            metadata: {
              virtualFolderId: folderId,
              refType: ref.ref_type,
              refId: ref.ref_id,
              title: ref.title,
              cardTag,
            },
          });
          chunkCount = upload.totalChunks;
        }

        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          content_hash: hash,
          status: 'indexed',
          chunk_count: chunkCount,
          indexed_at: new Date().toISOString(),
          analysis: analysisPayload as Record<string, unknown> | null,
        });
      } catch (e) {
        await this.folderRepo.upsertFolderIndexEntry(folderId, {
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          status: 'failed',
          error_message: e instanceof Error ? e.message : String(e),
          chunk_count: 0,
        });
      }
    }

    await this.folderRepo.deleteFolderIndexEntriesNotIn(folderId, activeRefs);

    const cardSummary = this.buildLegacyCardSummary(cardTag, {
      folderName: folder.name,
      analyses: collectedAnalyses,
      appearanceUrls: [...new Set(appearanceUrls)],
      voiceId,
      description: descriptionParts.join('\n\n').slice(0, 8000),
    });

    await this.folderRepo.updateFolderIndex(userId, folderId, {
      index_status: 'indexed',
      indexed_at: new Date().toISOString(),
      knowledge_base_id: kbId ?? undefined,
      index_error: null,
      card_status: cardTag ? 'ready' : undefined,
      card_summary: cardTag ? cardSummary : undefined,
    });
  }

  private collectFromAnalysis(
    analysis: ImageAnalysis & { media_url?: string },
    collected: ImageAnalysis[],
    appearanceUrls: string[],
    styleRefUrls: string[]
  ) {
    collected.push(analysis);
    const url = analysis.media_url;
    if (!url) return;
    if (analysis.use_as === 'identity') appearanceUrls.push(url);
    else if (['style_ref', 'mood', 'palette', 'product'].includes(analysis.use_as)) {
      styleRefUrls.push(url);
    }
  }

  private async resolveMediaUrl(ref: ResolvedRef): Promise<string | null> {
    if (ref.ref_type === 'storage_object') {
      return `/api/v1/media/object/${ref.ref_id}`;
    }
    return null;
  }

  private buildLegacyCardSummary(
    cardTag: FolderCardTag | null,
    input: {
      folderName: string;
      analyses: ImageAnalysis[];
      appearanceUrls: string[];
      voiceId?: string;
      description: string;
    }
  ): Record<string, unknown> {
    if (cardTag === 'character') {
      return {
        character: {
          display_name: input.folderName,
          voice_id: input.voiceId,
          description: input.description || undefined,
          appearance_image_urls: input.appearanceUrls.slice(0, 20),
          clothing_image_urls: [],
        },
      };
    }

    if (cardTag === 'knowledge') {
      return {
        knowledge: {
          topic: input.folderName,
          doc_count: input.analyses.length,
        },
      };
    }

    return {};
  }

  private stableKbName(folderId: string): string {
    return `vf_${folderId.replace(/-/g, '')}`;
  }

  private async folderKbDisplayName(folderId: string): Promise<string> {
    const path = await this.folderRepo.getFolderPath(folderId);
    const trail = path.length > 0 ? path.map((f) => f.name).join(' / ') : folderId;
    return `虚拟文件夹: ${trail}`;
  }

  private async ensureKnowledgeBase(
    folder: { id: string; name: string; knowledge_base_id?: string | null },
    userId: string
  ): Promise<string> {
    const displayName = await this.folderKbDisplayName(folder.id);

    if (folder.knowledge_base_id) {
      const kb = await this.knowledgeService.getKnowledgeBaseById(folder.knowledge_base_id);
      if (kb) {
        if (kb.display_name !== displayName) {
          try {
            await this.knowledgeService.updateKnowledgeBaseById(kb.id, {
              display_name: displayName,
              description: `Auto-created for virtual folder ${folder.id}`,
            });
          } catch (e) {
            console.warn('[VirtualFolderIndex] 更新 KB display_name 失败:', e);
          }
        }
        return kb.id;
      }
    }

    const name = this.stableKbName(folder.id);
    const kb = await this.knowledgeService.createKnowledgeBase({
      name,
      display_name: displayName,
      description: `Auto-created for virtual folder ${folder.id}`,
      type: 'hybrid',
      owner_id: userId,
      config: { virtualFolderId: folder.id, source: 'virtual_folder', folderName: folder.name },
    });

    await this.folderRepo.updateFolderIndex(userId, folder.id, {
      knowledge_base_id: kb.id,
    });

    return kb.id;
  }

  async getStatus(userId: string, folderId: string) {
    const folder = await assertVirtualFolder(folderId, userId);
    const entries = await this.folderRepo.getFolderIndexEntries(folderId);
    return {
      folder_id: folderId,
      index_status: folder.index_status ?? 'none',
      indexed_at: folder.indexed_at,
      knowledge_base_id: folder.knowledge_base_id,
      index_error: folder.index_error,
      card_tag: folder.card_tag ?? null,
      card_status: folder.card_status ?? 'idle',
      card_summary: folder.card_summary ?? {},
      is_system: folder.is_system === true,
      entries,
      indexing: indexingJobs.has(folderId),
    };
  }

  async getCard(userId: string, folderId: string) {
    const folder = await this.assertFolderReadable(userId, folderId);
    const items = await this.folderRepo.getFolderItems(folderId);
    const entries = await this.folderRepo.getFolderIndexEntries(folderId);
    const byRole: Record<string, unknown[]> = {};
    for (const it of items) {
      const role = it.asset_role || 'unknown';
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push({
        item_id: it.id,
        task_id: it.task_id,
        storage_object_id: it.storage_object_id,
        asset_role: role,
      });
    }
    return {
      folder_id: folder.id,
      name: folder.name,
      card_tag: folder.card_tag ?? null,
      card_status: folder.card_status ?? 'idle',
      card_summary: folder.card_summary ?? {},
      is_system: folder.is_system === true,
      assets_by_role: byRole,
      entries,
    };
  }

  /**
   * 用户编辑视觉风格 / 语感文风条目标签：写回 analysis.feature_tags，并同步卡面 exemplars。
   * 不改 fit_score / 不重排 Top5。
   */
  async updateItemFeatureTags(
    userId: string,
    folderId: string,
    itemId: string,
    featureTagsRaw: unknown
  ): Promise<{
    feature_tags: string[];
    ref_key: string;
    card_summary: Record<string, unknown>;
  }> {
    const folder = await this.assertFolderReadable(userId, folderId);
    if (folder.card_tag !== 'style' && folder.card_tag !== 'writing') {
      throw new Error('仅视觉风格卡 / 语感文风卡可编辑特征标签');
    }
    if (folder.is_system && folder.user_id !== userId) {
      throw new Error('无权编辑系统卡标签');
    }

    const feature_tags =
      folder.card_tag === 'writing'
        ? (await import('./writing-style-types')).normalizeWritingFeatureTags(featureTagsRaw)
        : (await import('./style-vision-types')).normalizeFeatureTags(featureTagsRaw);

    const items = await this.folderRepo.getFolderItems(folderId);
    const item = items.find((it) => it.id === itemId);
    if (!item) throw new Error('文件夹条目不存在');

    const ref_type = item.storage_object_id
      ? ('storage_object' as const)
      : item.task_id
        ? ('task' as const)
        : null;
    const ref_id = item.storage_object_id || item.task_id;
    if (!ref_type || !ref_id) throw new Error('条目无有效软链');

    const ref_key = `${ref_type}:${ref_id}`;
    const entries = await this.folderRepo.getFolderIndexEntries(folderId);
    const entry = entries.find((e) => e.ref_type === ref_type && e.ref_id === ref_id);
    const prevAnalysis =
      entry?.analysis && typeof entry.analysis === 'object' && !Array.isArray(entry.analysis)
        ? (entry.analysis as Record<string, unknown>)
        : {};

    await this.folderRepo.upsertFolderIndexEntry(folderId, {
      ref_type,
      ref_id,
      status: entry?.status === 'indexed' || entry?.status === 'failed' ? entry.status : 'indexed',
      content_hash: entry?.content_hash ?? null,
      chunk_count: entry?.chunk_count ?? 0,
      indexed_at: entry?.indexed_at ?? new Date().toISOString(),
      error_message: entry?.error_message ?? null,
      analysis: {
        ...prevAnalysis,
        feature_tags,
        ref_type,
        ref_id,
      },
    });

    const summary = { ...(folder.card_summary ?? {}) } as Record<string, unknown>;
    const packKey = folder.card_tag === 'writing' ? 'writing' : 'style';
    const packRaw = summary[packKey];
    if (packRaw && typeof packRaw === 'object' && !Array.isArray(packRaw)) {
      const pack = { ...(packRaw as Record<string, unknown>) };
      const exemplarsRaw = Array.isArray(pack.exemplars) ? pack.exemplars : [];
      pack.exemplars = exemplarsRaw.map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
        const e = row as Record<string, unknown>;
        if (String(e.ref_key ?? '') !== ref_key) return row;
        return { ...e, feature_tags };
      });
      summary[packKey] = pack;
      await this.folderRepo.updateFolderIndex(userId, folderId, {
        card_summary: summary,
      });
    }

    return {
      feature_tags,
      ref_key,
      card_summary: summary,
    };
  }

  /** 用户编辑角色卡字段（标 provenance=user） */
  async updateCharacterCardFields(
    userId: string,
    folderId: string,
    patch: Record<string, unknown>
  ): Promise<{ character: CharacterPackSummary }> {
    const { applyUserCharacterFieldPatch, isCharacterPackSummary } = await import(
      './character-vision-types'
    );
    const folder = await this.assertFolderReadable(userId, folderId);
    if (folder.card_tag !== 'character') {
      throw new Error('仅角色卡可编辑人设字段');
    }
    if (folder.is_system && folder.user_id !== userId) {
      throw new Error('无权编辑系统角色卡');
    }
    const raw = (folder.card_summary as { character?: unknown } | null)?.character;
    if (!raw || !isCharacterPackSummary(raw)) {
      throw new Error('角色卡尚未解析完成');
    }
    const character = applyUserCharacterFieldPatch(raw, patch);
    await this.folderRepo.updateFolderIndex(userId, folderId, {
      card_summary: { ...(folder.card_summary ?? {}), character },
    });
    return { character };
  }

  private async assertFolderReadable(userId: string, folderId: string): Promise<Folder> {
    const folder = await this.folderRepo.getFolderById(folderId);
    if (!folder || folder.folder_kind !== 'virtual') {
      throw new Error('虚拟文件夹不存在');
    }
    if (folder.user_id !== userId && !folder.is_system) {
      throw new Error('无权访问该文件夹');
    }
    return folder;
  }

  async search(userId: string, folderId: string, query: string, limit = 5) {
    const folder = await this.assertFolderReadable(userId, folderId);
    if (!folder.knowledge_base_id) {
      throw new Error('文件夹尚未向量化');
    }
    return this.knowledgeService.searchById({
      knowledgeBaseId: folder.knowledge_base_id,
      query,
      searchType: 'hybrid',
      limit,
      userId,
    });
  }
}

export const virtualFolderIndexService = new VirtualFolderIndexService();
