import { Router } from 'express';
import { RepositoryFactory, normalizeAppLocale, type AppLocale } from '@mxmai/mxmdata';
import type { FolderAssetRole } from '@mxmai/mxmdata';
import { virtualFolderIndexService } from './virtual-folder-index-service';

const router = Router();
const folderRepo = RepositoryFactory.createFolderRepository();

function getUserId(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const id = req.headers['x-user-id'];
  if (typeof id === 'string' && id) return id;
  return null;
}

/**
 * 读取前端 UI 语言（zh | zh-TW | en | ja），供 VF 解析时按用户语言输出业务结果。
 * 不带 header 时默认 zh。
 */
function getUserLanguage(req: { headers: Record<string, string | string[] | undefined> }): AppLocale {
  const raw = req.headers['x-user-lang'];
  if (typeof raw === 'string' && raw.trim()) return normalizeAppLocale(raw);
  return 'zh';
}

router.post('/:folderId', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ code: 401, message: '未认证', error: 'UNAUTHORIZED' });
    }

    const { folderId } = req.params;
    const force = req.body?.force === true;
    const userLang = getUserLanguage(req);

    void virtualFolderIndexService
      .startIndex(userId, folderId, force, userLang)
      .catch((e) => {
        console.error('[virtual-folder-index]', folderId, e);
      });

    res.status(202).json({
      code: 202,
      message: '解析/向量化已开始',
      data: { folder_id: folderId, index_status: 'indexing', card_status: 'parsing' },
    });
  } catch (e) {
    res.status(400).json({
      code: 400,
      message: e instanceof Error ? e.message : String(e),
      error: 'INDEX_ERROR',
    });
  }
});

/** POST /parse — 同 startIndex，语义更明确 */
router.post('/:folderId/parse', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ code: 401, message: '未认证', error: 'UNAUTHORIZED' });
    }
    const force = req.body?.force === true;
    const userLang = getUserLanguage(req);
    void virtualFolderIndexService
      .startParse(userId, req.params.folderId, force, userLang)
      .catch((e) => {
        console.error('[virtual-folder-parse]', req.params.folderId, e);
      });
    res.status(202).json({
      code: 202,
      message: '卡解析已开始',
      data: { folder_id: req.params.folderId, card_status: 'parsing' },
    });
  } catch (e) {
    res.status(400).json({
      code: 400,
      message: e instanceof Error ? e.message : String(e),
      error: 'PARSE_ERROR',
    });
  }
});

router.get('/:folderId/status', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ code: 401, message: '未认证', error: 'UNAUTHORIZED' });
    }

    const status = await virtualFolderIndexService.getStatus(userId, req.params.folderId);
    res.json({ code: 200, message: 'ok', data: status });
  } catch (e) {
    res.status(400).json({
      code: 400,
      message: e instanceof Error ? e.message : String(e),
      error: 'STATUS_ERROR',
    });
  }
});

router.get('/:folderId/card', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ code: 401, message: '未认证', error: 'UNAUTHORIZED' });
    }
    const card = await virtualFolderIndexService.getCard(userId, req.params.folderId);
    res.json({ code: 200, message: 'ok', data: card });
  } catch (e) {
    res.status(400).json({
      code: 400,
      message: e instanceof Error ? e.message : String(e),
      error: 'CARD_ERROR',
    });
  }
});

router.patch('/:folderId/items/:itemId/asset-role', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ code: 401, message: '未认证', error: 'UNAUTHORIZED' });
    }
    const role = String(req.body?.asset_role ?? '').trim() as FolderAssetRole;
    const allowed: FolderAssetRole[] = [
      'style_ref',
      'palette',
      'appearance',
      'description',
      'voice',
      'doc',
      'unknown',
    ];
    if (!allowed.includes(role)) {
      return res.status(400).json({ code: 400, message: '无效 asset_role', error: 'VALIDATION_ERROR' });
    }
    const folder = await folderRepo.getFolderById(req.params.folderId);
    if (!folder || folder.user_id !== userId) {
      return res.status(403).json({ code: 403, message: '无权操作', error: 'FORBIDDEN' });
    }
    const item = await folderRepo.updateFolderItemAssetRole(
      req.params.folderId,
      req.params.itemId,
      role
    );
    res.json({ code: 200, message: 'ok', data: item });
  } catch (e) {
    res.status(400).json({
      code: 400,
      message: e instanceof Error ? e.message : String(e),
      error: 'ASSET_ROLE_ERROR',
    });
  }
});

router.patch('/:folderId/items/:itemId/feature-tags', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ code: 401, message: '未认证', error: 'UNAUTHORIZED' });
    }
    if (!Array.isArray(req.body?.feature_tags) && req.body?.feature_tags != null) {
      return res.status(400).json({
        code: 400,
        message: 'feature_tags 须为字符串数组',
        error: 'VALIDATION_ERROR',
      });
    }
    const data = await virtualFolderIndexService.updateItemFeatureTags(
      userId,
      req.params.folderId,
      req.params.itemId,
      req.body?.feature_tags ?? []
    );
    res.json({ code: 200, message: 'ok', data });
  } catch (e) {
    res.status(400).json({
      code: 400,
      message: e instanceof Error ? e.message : String(e),
      error: 'FEATURE_TAGS_ERROR',
    });
  }
});

router.patch('/:folderId/character', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ code: 401, message: '未认证', error: 'UNAUTHORIZED' });
    }
    const patch =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const data = await virtualFolderIndexService.updateCharacterCardFields(
      userId,
      req.params.folderId,
      patch
    );
    res.json({ code: 200, message: 'ok', data });
  } catch (e) {
    res.status(400).json({
      code: 400,
      message: e instanceof Error ? e.message : String(e),
      error: 'CHARACTER_PATCH_ERROR',
    });
  }
});

router.post('/:folderId/search', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ code: 401, message: '未认证', error: 'UNAUTHORIZED' });
    }

    const query = String(req.body?.query ?? '').trim();
    if (!query) {
      return res.status(400).json({ code: 400, message: 'query 不能为空', error: 'VALIDATION_ERROR' });
    }

    const limit = req.body?.limit ? Number(req.body.limit) : 5;
    const results = await virtualFolderIndexService.search(userId, req.params.folderId, query, limit);
    res.json({ code: 200, message: 'ok', data: { results } });
  } catch (e) {
    res.status(400).json({
      code: 400,
      message: e instanceof Error ? e.message : String(e),
      error: 'SEARCH_ERROR',
    });
  }
});

export default router;
