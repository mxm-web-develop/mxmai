export {
  PLATFORM_ERROR_CODES,
  PLATFORM_ERROR_USER_MESSAGES,
  RETRYABLE_ERROR_CODES,
  type PlatformErrorCode,
  isPlatformErrorCode,
  userMessageForCode,
  looksLikeLeakyErrorText,
} from './error-codes';

export { PlatformError, isPlatformError, type PlatformErrorOptions } from './platform-error';

export {
  mapUpstreamError,
  inferCodeFromMessage,
  userMessageFromStoredError,
  scrubInternalErrorCopy,
} from './map-upstream-error';

export {
  shapeErrorForViewer,
  sanitizeProgressError,
  sanitizeErrorTextForUser,
  isAdminFromRequest,
  type ShapeErrorOptions,
  type ShapedErrorBody,
  type SanitizedProgress,
} from './shape-error-response';
