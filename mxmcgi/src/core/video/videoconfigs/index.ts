/**
 * 视频业务层配置（动态）
 * - 模型路由：video_scope_config（见 resolveVideoModel）
 * - 表单选项：Task V2 formSchema（见 getVideoFormOptionsResolved）
 *
 * 已移除 CGI_VIDEO_MODE / sora-2 固定模式与 normalizeSeconds 硬编码。
 */

export {
  coerceVideoDuration,
  buildVideoChunkTaskParams,
  getBestSize,
  DEFAULT_VIDEO_DURATION_OPTIONS,
  extractDurationOptionsFromFormSchema,
} from '../video-params';

export {
  getVideoProtocolForModel,
  mapFormParamsToProviderGenerate,
  normalizeVideoProtocol,
  type VideoProviderProtocol,
} from '../provider-param-map';

export {
  getVideoFormOptionsResolved,
  type VideoFormOption,
  type VideoFormOptionsConfig,
} from '../video-form-options';

export {
  resolveVideoTaskKey,
  resolveVideoTaskKeyFromScriptType,
  DEFAULT_VIDEO_TASK_KEY,
} from '../video-task-keys';
