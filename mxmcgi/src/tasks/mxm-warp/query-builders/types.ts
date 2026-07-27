/**
 * webSearch 命名 queryBuilder 插件契约。
 * 业务专用拼查询挂在此，勿改 web-search-step 核心。
 */
import type { DeepSearchRequest, SearchDepth } from '../../../core/search/types';
import type { PipelineStep, TaskContext } from '../../types';

export type WebSearchBuilderSearchFn = (args: DeepSearchRequest) => Promise<{
  items: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
  providers: string[];
}>;

export type WebSearchQueryBuilder = {
  name: string;
  /** 拼查询；返回空则回退 queryTemplate / queryFrom */
  buildQuery(ctx: TaskContext, step: PipelineStep): string;
  /** 组装 SearchService 请求（可覆盖通用 params） */
  buildRequest(
    ctx: TaskContext,
    step: PipelineStep,
    query: string,
    opts: { depth: SearchDepth; maxResults: number }
  ): DeepSearchRequest;
  /** 检索前规范化（写回 report_ymd / search_track 等） */
  prepareContext?(ctx: TaskContext, step: PipelineStep): Promise<TaskContext>;
  /** 多路查询；缺省则核心单次 search */
  runMultiQuery?(args: {
    ctx: TaskContext;
    step: PipelineStep;
    searchRequest: DeepSearchRequest;
    searchFn: WebSearchBuilderSearchFn;
    maxResults: number;
    primaryQuery: string;
  }): Promise<{
    items: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
    providers: string[];
    queryLabel: string;
  }>;
};
