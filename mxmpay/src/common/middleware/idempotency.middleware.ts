import { Request, Response, NextFunction } from 'express';

type CacheValue = { statusCode: number; body: any; timestamp: number };

export class IdempotencyMiddleware {
  private store = new Map<string, CacheValue>();
  private ttlMs = 5 * 60 * 1000; // 5 分钟

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key: string | undefined = req.headers['idempotency-key'] as string || 
                                      req.headers['Idempotency-Key'] as string;
      if (!key) {
        return next();
      }

      const now = Date.now();
      // 清理过期
      for (const [k, v] of this.store) {
        if (now - v.timestamp > this.ttlMs) {
          this.store.delete(k);
        }
      }

      const hit = this.store.get(key);
      if (hit) {
        res.statusCode = hit.statusCode;
        return res.json(hit.body);
      }

      // 保存原始的 json 方法
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        const status = res.statusCode ?? 200;
        this.store.set(key, { statusCode: status, body, timestamp: Date.now() });
        return originalJson(body);
      };

      next();
    };
  }
}

