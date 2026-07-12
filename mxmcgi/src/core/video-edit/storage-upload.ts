/**
 * video-edit 渲染产物上传 MinIO（带存在性校验 + 重试）
 */
import { readFileSync } from "node:fs";
import { RepositoryFactory, loadStorageConfig, resolveStorageUrl } from "@mxmai/mxmdata";
import { getGeneratedBucket } from "../../storage/generated-temp";
import crypto from "node:crypto";
import { parseClipUploadAttempts, withRetries } from "./clip-retry";

export async function persistLocalFileToStorage(input: {
  localPath: string;
  userId: string;
  parentTaskId?: string;
  clipId: string;
  ext: string;
  contentType: string;
}): Promise<{ url: string; key: string; bucket: string }> {
  const buffer = readFileSync(input.localPath);
  if (!buffer.length) {
    throw new Error(`本地渲染产物为空: ${input.localPath}`);
  }

  const bucket = getGeneratedBucket();
  const attempts = parseClipUploadAttempts();
  const repo = RepositoryFactory.createStorageRepository("generated");

  const uploaded = await withRetries(
    attempts,
    async (attempt) => {
      const randomId = crypto.randomUUID().slice(0, 8);
      const key = `${input.userId}/video-edit/${Date.now()}-${randomId}/${input.clipId}.${input.ext}`;
      const result = await repo.uploadFile(bucket, key, buffer, {
        contentType: input.contentType,
        metadata: {
          parentTaskId: input.parentTaskId ?? "",
          clipId: input.clipId,
          uploadAttempt: String(attempt + 1),
        },
        expiresIn: 7 * 24 * 60 * 60,
      });

      const finalBucket = result.bucket || bucket;
      const finalKey = result.key || key;

      // PutObject 成功后立刻 HEAD，避免“有 URL 无对象”进入二审
      const exists = await repo.fileExists(finalBucket, finalKey);
      if (!exists) {
        throw new Error(`上传后对象不存在: ${finalBucket}/${finalKey}`);
      }

      return { bucket: finalBucket, key: finalKey };
    },
    {
      label: `persist-${input.clipId}`,
      onRetry: (error, attempt, delayMs) => {
        console.warn(
          `[video-edit-upload] ${input.clipId} 第 ${attempt + 1} 次上传失败，${delayMs}ms 后重试:`,
          error instanceof Error ? error.message : error
        );
      },
    }
  );

  const generatedCfg = loadStorageConfig().domains.generated;
  const publicUrl = resolveStorageUrl({
    domain: "generated",
    domainConfig: generatedCfg,
    bucket: uploaded.bucket,
    key: uploaded.key,
    gatewayOrigin: process.env.PUBLIC_GATEWAY_ORIGIN,
  });

  return { url: publicUrl, key: uploaded.key, bucket: uploaded.bucket };
}
