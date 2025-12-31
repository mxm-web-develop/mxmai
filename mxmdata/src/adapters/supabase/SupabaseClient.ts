/**
 * Supabase 客户端封装
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey?: string; // 用于服务端操作，有更高权限
}

/**
 * 初始化 Supabase 客户端
 */
export function initSupabaseClient(config: SupabaseConfig): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  // 优先使用 serviceKey（服务端），否则使用 anonKey
  const key = config.serviceKey || config.anonKey;
  supabaseClient = createClient(config.url, key, {
    auth: {
      persistSession: false, // 服务端不需要持久化会话
    },
  });

  return supabaseClient;
}

/**
 * 获取 Supabase 客户端实例
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call initSupabaseClient first.');
  }
  return supabaseClient;
}

/**
 * 重置客户端（主要用于测试）
 */
export function resetSupabaseClient(): void {
  supabaseClient = null;
}

