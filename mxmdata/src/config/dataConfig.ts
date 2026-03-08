/**
 * 数据访问层配置
 * 
 * 注意：优先使用 Supabase 方案，不直接访问 PostgreSQL
 * PostgreSQL 适配器尚未实现，当前只支持 Supabase
 */

export interface DataLayerConfig {
  adapter: 'supabase'; // 当前只支持 Supabase，PostgreSQL 适配器尚未实现
  supabase?: {
    url: string;
    anonKey: string;
    serviceKey?: string;
  };
  // PostgreSQL 适配器尚未实现，当前只支持 Supabase
  // postgresql?: {
  //   host: string;
  //   port: number;
  //   database: string;
  //   user: string;
  //   password: string;
  // };
  minio: {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    region?: string;
  };
}

/**
 * 从环境变量加载配置
 * 默认使用 Supabase，这是推荐的方案
 */
export function loadDataConfig(): DataLayerConfig {
  // 默认使用 Supabase，这是推荐的方案
  const adapter = (process.env.DATA_ADAPTER as 'supabase') || 'supabase';
  
  if (adapter !== 'supabase') {
    throw new Error('当前只支持 Supabase 适配器，PostgreSQL 适配器尚未实现');
  }

  const config: DataLayerConfig = {
    adapter,
    minio: {
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      region: process.env.MINIO_REGION,
    },
  };

  if (adapter === 'supabase') {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required when using Supabase adapter');
    }

    // 规范化 URL：移除末尾斜杠，Supabase 客户端会自动添加路径
    const normalizedUrl = supabaseUrl.trim().replace(/\/+$/, '');

    config.supabase = {
      url: normalizedUrl,
      anonKey: supabaseAnonKey,
      serviceKey: supabaseServiceKey,
    };
  }
  
  // PostgreSQL 适配器尚未实现
  // 如果需要直接访问 PostgreSQL，请使用 Supabase（它基于 PostgreSQL）

  return config;
}

