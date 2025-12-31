/**
 * 通用响应 DTO
 * 用于统一 API 响应格式
 */
export class ApiResponseDto<T = any> {
  code: number;
  message: string;
  data: T | null;
  timestamp: string;

  constructor(code: number, message: string, data: T | null = null) {
    this.code = code;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
  }

  /**
   * 成功响应
   * @param data 响应数据
   * @param message 成功消息
   * @returns ApiResponseDto
   */
  static success<T>(data: T, message = '操作成功'): ApiResponseDto<T> {
    return new ApiResponseDto(200, message, data);
  }

  /**
   * 错误响应
   * @param message 错误消息
   * @param code 错误码
   * @returns ApiResponseDto
   */
  static error(message: string, code = 400): ApiResponseDto<null> {
    return new ApiResponseDto(code, message, null);
  }
}

/**
 * 分页请求 DTO
 */
export interface PaginationDto {
  page?: number;
  limit?: number;
}

/**
 * 分页响应 DTO
 */
export interface PaginationResponseDto<T = any> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

