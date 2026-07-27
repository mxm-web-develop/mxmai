import { Router, Request, Response } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';
import {
  deletePartnerEndUserStorageObject,
  UserStorageObjectNotFoundError,
} from './user-upload-service';
import {
  enrichEndUserLabels,
  getPartnerUploadContext,
  mapStorageObjectListItems,
} from './storage-list-helpers';

const router = Router();

router.get('/uploads', async (req: Request, res: Response) => {
  try {
    const partner = getPartnerUploadContext(req);
    if (!partner) {
      return res.status(403).json({
        success: false,
        error: 'Partner session required',
      });
    }

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const repo = RepositoryFactory.createStorageObjectRepository();
    const result = await repo.listByPartnerEndUser(partner.partnerAppId, partner.partnerEndUserId, {
      limit,
      offset,
    });
    const mapped = await mapStorageObjectListItems(result.items);
    const items = await enrichEndUserLabels(mapped, partner.partnerAppId);

    return res.json({
      success: true,
      data: {
        items,
        total: result.total,
      },
    });
  } catch (error) {
    console.error('[Partner Upload Route] list failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.delete('/uploads/:objectId', async (req: Request, res: Response) => {
  try {
    const partner = getPartnerUploadContext(req);
    if (!partner) {
      return res.status(403).json({
        success: false,
        error: 'Partner session required',
      });
    }

    await deletePartnerEndUserStorageObject(
      partner.partnerAppId,
      partner.partnerEndUserId,
      req.params.objectId
    );
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof UserStorageObjectNotFoundError) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    console.error('[Partner Upload Route] delete failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
