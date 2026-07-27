import { Router, Request, Response } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';
import {
  deleteUserStorageObject,
  moveUserStorageObjects,
  UserStorageObjectNotFoundError,
  PartnerUploadForbiddenError,
} from './user-upload-service';
import { FolderPathForbiddenError, FolderPathNotFoundError } from '@mxmai/mxmdata';
import {
  enrichEndUserLabels,
  mapStorageObjectListItems,
  parseUploadSource,
} from './storage-list-helpers';

const router = Router();

router.get('/objects', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }
    const purpose = typeof req.query.purpose === 'string' ? req.query.purpose : undefined;
    const storageModeRaw = req.query.storageMode;
    const storageMode =
      storageModeRaw === 'temp' ? 'temp' : storageModeRaw === 'asset' ? 'asset' : undefined;
    const folderIdRaw = req.query.folderId;
    let folderId: string | null | undefined;
    if (folderIdRaw === 'root' || folderIdRaw === '') {
      folderId = null;
    } else if (typeof folderIdRaw === 'string' && folderIdRaw) {
      folderId = folderIdRaw;
    }
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const uploadSource = parseUploadSource(req.query.uploadSource) ?? 'self';
    const partnerAppId =
      typeof req.query.partnerAppId === 'string' ? req.query.partnerAppId : undefined;
    const partnerEndUserId =
      typeof req.query.partnerEndUserId === 'string' ? req.query.partnerEndUserId : undefined;
    const repo = RepositoryFactory.createStorageObjectRepository();
    const listOpts: Parameters<typeof repo.listByUser>[1] = {
      domain: 'user_upload',
      purpose,
      limit,
      offset,
      uploadSource,
    };
    if (partnerAppId) listOpts.partnerAppId = partnerAppId;
    if (partnerEndUserId) listOpts.partnerEndUserId = partnerEndUserId;
    if (storageMode) listOpts.storageMode = storageMode;
    if (folderIdRaw !== undefined) listOpts.folderId = folderId;
    const result = await repo.listByUser(userId, listOpts);
    const mapped = await mapStorageObjectListItems(result.items);
    const items = await enrichEndUserLabels(mapped, partnerAppId);
    return res.json({
      success: true,
      data: {
        items,
        total: result.total,
      },
    });
  } catch (error) {
    console.error('[Storage Route] list objects failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post('/objects/move', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }
    const body = req.body as { objectIds?: unknown; folderId?: unknown };
    const objectIds = Array.isArray(body.objectIds)
      ? body.objectIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    let folderId: string | null = null;
    if (body.folderId === null || body.folderId === '' || body.folderId === 'root') {
      folderId = null;
    } else if (typeof body.folderId === 'string' && body.folderId) {
      folderId = body.folderId;
    }
    if (objectIds.length === 0) {
      return res.status(400).json({ success: false, error: 'objectIds required' });
    }
    const moved = await moveUserStorageObjects(userId, objectIds, folderId);
    return res.json({ success: true, data: { moved, folderId } });
  } catch (error) {
    if (error instanceof UserStorageObjectNotFoundError) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    if (error instanceof PartnerUploadForbiddenError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof FolderPathNotFoundError || error instanceof FolderPathForbiddenError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('[Storage Route] move objects failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.delete('/objects/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }
    await deleteUserStorageObject(userId, req.params.id);
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof UserStorageObjectNotFoundError) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    console.error('[Storage Route] delete object failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
