/** 对象存储按字节范围读取（HTTP Range / S3 Range） */
export interface ReadStreamRange {
  start: number;
  end: number;
}
