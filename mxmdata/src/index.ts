/**
 * mxmdata - 数据访问层
 * 统一导出接口、模型、适配器和工厂
 */

// 导出接口
export * from './interfaces';

// 导出模型
export * from './models';

// 导出适配器
export * from './adapters/supabase';
export * from './adapters/minio';

// 导出工厂
export * from './factories';

// 导出配置
export * from './config/dataConfig';
