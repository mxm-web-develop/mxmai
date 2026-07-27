import './industry-trend';
export { registerWebSearchQueryBuilder, resolveWebSearchQueryBuilder, listWebSearchQueryBuilderNames } from './registry';
export type { WebSearchQueryBuilder } from './types';
export {
  buildIndustryTrendSearchQuery,
  mergeIndustryParams,
  registerIndustryTrendQueryBuilder,
} from './industry-trend';
