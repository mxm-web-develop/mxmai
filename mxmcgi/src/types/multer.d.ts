/**
 * Multer 类型声明
 * 用于解决 multer 模块缺少类型定义的问题
 */
declare module 'multer' {
  import { Request } from 'express';

  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
  }

  interface StorageEngine {
    _handleFile(
      req: Request,
      file: Express.Multer.File,
      callback: (error?: any, info?: Partial<Express.Multer.File>) => void
    ): void;
    _removeFile(
      req: Request,
      file: Express.Multer.File,
      callback: (error: Error | null) => void
    ): void;
  }

  interface Options {
    dest?: string;
    storage?: StorageEngine;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      headerPairs?: number;
    };
    preservePath?: boolean;
    fileFilter?: (
      req: Request,
      file: Express.Multer.File,
      callback: (error: Error | null, acceptFile: boolean) => void
    ) => void;
  }

  interface Multer {
    (options?: Options): {
      single(name: string): (req: Request, res: any, next: any) => void;
      array(name: string, maxCount?: number): (req: Request, res: any, next: any) => void;
      fields(fields: Array<{ name: string; maxCount?: number }>): (req: Request, res: any, next: any) => void;
      none(): (req: Request, res: any, next: any) => void;
      any(): (req: Request, res: any, next: any) => void;
    };
    memoryStorage(): StorageEngine;
    diskStorage(options: {
      destination?: string | ((req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => void);
      filename?: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => void;
    }): StorageEngine;
  }

  const multer: Multer;
  export = multer;
}
