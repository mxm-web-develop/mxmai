/**
 * Graph配置映射表
 * 所有支持的graph类型都在这里注册
 */

import { photographConfig, type PhotographTypeConfig } from './photograph';
import { designConfig, type DesignTypeConfig } from './design';
import { paintingConfig, type PaintingTypeConfig } from './painting';

export type GraphTypeConfig = PhotographTypeConfig | DesignTypeConfig | PaintingTypeConfig;

/**
 * 配置映射表
 */
const CONFIG_MAP: Record<string, GraphTypeConfig> = {
  photograph: photographConfig,
  design: designConfig,
  painting: paintingConfig,
};

/**
 * 根据graph类型获取对应的配置
 * @param graphType graph类型（photograph、design、painting）
 * @returns 配置对象，如果类型不存在则返回null
 */
export function getGraphTypeConfig(graphType?: string): GraphTypeConfig | null {
  if (!graphType) {
    return null;
  }

  return CONFIG_MAP[graphType] || null;
}

/**
 * 根据graph类型和小类型获取对应的rules
 * @param graphType graph类型（photograph、design、painting）
 * @param type 小类型（如portrait、landscape等）
 * @returns rules字符串，如果类型不存在则返回空字符串
 */
export function getGraphRulesForType(graphType: string, type: string): string {
  const config = getGraphTypeConfig(graphType);
  if (!config) {
    return '';
  }

  return config.getRulesForType(type);
}

/**
 * 根据graph类型和小类型获取需要的参数列表
 * @param graphType graph类型（photograph、design、painting）
 * @param type 小类型（如portrait、landscape等）
 * @returns 参数列表，如果类型不存在则返回空数组
 */
export function getGraphParamsForType(graphType: string, type: string): string[] {
  const config = getGraphTypeConfig(graphType);
  if (!config) {
    return [];
  }

  return config.getParamsForType(type);
}

/**
 * 根据graph类型和小类型获取中文标签
 * @param graphType graph类型（photograph、design、painting）
 * @param type 小类型（如portrait、landscape等）
 * @returns 中文标签，如果类型不存在则返回原值
 */
export function getGraphTypeLabel(graphType: string, type: string): string {
  const config = getGraphTypeConfig(graphType);
  if (!config) {
    return type;
  }

  return config.getTypeLabel(type);
}

/**
 * 获取graph类型的所有小类型选项
 * @param graphType graph类型（photograph、design、painting）
 * @returns 类型选项列表，如果类型不存在则返回空数组
 */
export function getGraphTypeOptions(graphType: string): Array<{ value: string; label: string }> {
  const config = getGraphTypeConfig(graphType);
  if (!config) {
    return [];
  }

  return config.typeOptions;
}
