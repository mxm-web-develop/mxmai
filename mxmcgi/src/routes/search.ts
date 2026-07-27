import { Router, Request, Response } from 'express';
import type { SearchService } from '../core/search/search-service';
import type {
  SearchDimension,
  SearchDepth,
  DeepSearchRequest,
} from '../core/search/types';

const router = Router();

// Lazy-initialized service
let _searchService: SearchService | null = null;

function getSearchService(): SearchService {
  if (_searchService === null) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SearchService } = require('../core/search/search-service');
    _searchService = new SearchService();
  }
  return _searchService!;
}

/** GET /api/v1/search */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, dimensions, depth, num, timeRange } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Missing required parameter: q' });
    }

    const service = getSearchService();
    const result = await service.deepSearch({
      query: String(q),
      dimensions: dimensions
        ? (String(dimensions).split(',') as SearchDimension[])
        : ['general'],
      depth: (depth as SearchDepth) || 'standard',
      numResults: num ? parseInt(String(num), 10) : 10,
      timeRange:
        timeRange === 'day' || timeRange === 'week' || timeRange === 'month' || timeRange === 'year'
          ? timeRange
          : undefined,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[Search API] GET / failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/v1/search/industry-daily-topics — 行业日报 pre：该日该行业热门要闻话题（话题提炼走可配置 text 业务计价） */
router.post('/industry-daily-topics', async (req: Request, res: Response) => {
  try {
    const userId = String(req.headers['x-user-id'] ?? '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Missing x-user-id header' });
    }
    const body = (req.body ?? {}) as {
      industry?: string;
      industryCustom?: string;
      industry_custom?: string;
      dateMode?: string;
      date_mode?: string;
      reportDate?: string;
      report_date?: string;
      maxResults?: number;
      topicCount?: number;
      topic_count?: number;
      searchTrack?: string;
      search_track?: string;
      language?: string;
      searchRegion?: string;
      search_region?: string;
      /** 直接指定 text 业务，如 text/expert/conclusion */
      topicExtractTextKey?: string;
      /** 或从 writing 业务 pipeline.pre.webSearch 读取 */
      writingTaskKey?: string;
      writingSubtype?: string | null;
      taskKey?: string;
      subtype?: string | null;
    };
    const industry = String(body.industry ?? '').trim();
    if (!industry) {
      return res.status(400).json({ error: 'Missing required field: industry' });
    }

    const {
      DEFAULT_TOPIC_EXTRACT_TEXT_KEY,
      extractTopicChipsViaTextBusiness,
      readTopicExtractTextKeyFromWritingPipeline,
    } = await import('../tasks/websearch-topic-extract');
    const { previewIndustryDailyTopics } = await import(
      '../tasks/mxm-warp/industry-daily-topics'
    );
    const { RepositoryFactory } = await import('@mxmai/mxmdata');

    let topicExtractTextKey = String(body.topicExtractTextKey ?? '').trim();
    if (!topicExtractTextKey.startsWith('text/')) {
      const writingTaskKey = String(body.writingTaskKey ?? body.taskKey ?? 'editorial').trim();
      const writingSubtypeRaw = body.writingSubtype ?? body.subtype;
      const writingSubtype =
        writingSubtypeRaw == null || String(writingSubtypeRaw).trim() === ''
          ? 'industry-daily'
          : String(writingSubtypeRaw).trim();
      try {
        const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
        const row = await repo.findByKey('writing', writingTaskKey, writingSubtype);
        const extra = (row?.extra ?? {}) as Record<string, unknown>;
        const taskTemplate = extra.taskTemplate as
          | { pipeline?: { pre?: Array<{ step?: string; params?: Record<string, unknown> }> } }
          | undefined;
        topicExtractTextKey =
          readTopicExtractTextKeyFromWritingPipeline(taskTemplate?.pipeline) || '';
      } catch (e) {
        console.warn(
          '[Search API] resolve topicExtractTextKey from writing failed:',
          e instanceof Error ? e.message : e
        );
      }
    }
    if (!topicExtractTextKey.startsWith('text/')) {
      topicExtractTextKey = DEFAULT_TOPIC_EXTRACT_TEXT_KEY;
    }

    const service = getSearchService();
    const industryCustom =
      String(body.industryCustom ?? body.industry_custom ?? '').trim() || undefined;
    const dateMode = String(body.dateMode ?? body.date_mode ?? 'today').trim();
    const reportDate = String(body.reportDate ?? body.report_date ?? '').trim() || undefined;

    let topicExtractTaskId: string | null = null;
    let topicExtractFilteredOut = 0;

    const searchTrack =
      String(body.searchTrack ?? body.search_track ?? '').trim() || undefined;
    const language = String(body.language ?? '').trim() || undefined;
    const searchRegion =
      String(body.searchRegion ?? body.search_region ?? 'global').trim() || 'global';

    const result = await previewIndustryDailyTopics(
      {
        industry,
        industryCustom,
        dateMode,
        reportDate,
        maxResults: body.maxResults,
        topicCount: body.topicCount ?? body.topic_count,
        searchTrack,
        language,
        searchRegion,
        userId,
      },
      async ({
        query,
        dimensions,
        depth,
        numResults,
        timeRange,
        startDate,
        endDate,
        includeDomains,
        language: searchLang,
      }) => {
        const r = await service.deepSearch({
          query,
          dimensions,
          depth,
          numResults,
          timeRange,
          startDate,
          endDate,
          includeDomains,
          language: searchLang,
        });
        const providers = [
          ...new Set(
            (r.aggregated ?? [])
              .map((it) => String((it as { source?: string }).source ?? '').trim())
              .filter(Boolean)
          ),
        ];
        return {
          aggregated: r.aggregated ?? [],
          providers,
          depth: String(r.depth ?? depth),
        };
      },
      {
        extractTopics: async ({
          items,
          industry: sector,
          ymd,
          dateLabel,
          query,
          maxTopics,
          language: topicLang,
        }) => {
          const extracted = await extractTopicChipsViaTextBusiness({
            textKey: topicExtractTextKey,
            userId,
            industry: sector,
            dateMode,
            ymd,
            dateLabel,
            language: topicLang || language || 'zh',
            websource: {
              query,
              hitCount: items.length,
              items,
            },
            maxTopics,
            maxInputItems: Math.min(items.length, 80),
          });
          topicExtractTaskId = extracted.textTaskId;
          topicExtractFilteredOut = extracted.filteredOut;
          return extracted.topics;
        },
      }
    );

    // 把提炼后的 chips 一并写入 websource，供后续 create 时跳过重复 pre 检索
    const websource = {
      query: result.query,
      depth: result.depth,
      providers: result.providers,
      hitCount: result.hitCount,
      truncated: result.truncated,
      text: result.text,
      items: result.items,
      topicChips: result.topicChips,
    };

    res.json({
      query: result.query,
      queries: result.queries,
      ymd: result.ymd,
      dateLabel: result.dateLabel,
      depth: result.depth,
      providers: result.providers,
      aggregated: result.items,
      topicChips: result.topicChips,
      search_track: result.search_track,
      track_source: result.track_source,
      topicExtractTextKey,
      topicExtractTaskId,
      topicExtractFilteredOut,
      websource,
    });
  } catch (error: any) {
    console.error('[Search API] POST /industry-daily-topics failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/v1/search/deep */
router.post('/deep', async (req: Request, res: Response) => {
  try {
    const request: DeepSearchRequest = req.body;

    if (!request.query) {
      return res.status(400).json({ error: 'Missing required field: query' });
    }

    const service = getSearchService();
    const result = await service.deepSearchWithExtract(request);

    res.json(result);
  } catch (error: any) {
    console.error('[Search API] POST /deep failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/v1/search/providers */
router.get('/providers', async (_req: Request, res: Response) => {
    const providers = [
      { name: 'brave', status: 'active', dimensions: ['general', 'news', 'social'] },
      { name: 'tavily', status: 'active', dimensions: ['general', 'news', 'academic', 'forum', 'finance'] },
      {
        name: 'anysearch',
        status: 'active',
        dimensions: ['general', 'news', 'academic', 'forum', 'social', 'finance', 'official'],
      },
      { name: 'arxiv', status: 'active', dimensions: ['academic'] },
      { name: 'serpapi', status: 'inactive', dimensions: ['all'] },
      { name: 'duckduckgo', status: 'inactive', dimensions: ['general'] },
      { name: 'bing', status: 'active', dimensions: ['general', 'news'] },
      { name: 'bocha', status: 'active', dimensions: ['general', 'news', 'academic', 'forum'] },
    ];
    res.json({ providers });
});

/** GET /api/v1/search/providers/enabled — 写作 webSearch 字段可选源 */
router.get('/providers/enabled', async (_req: Request, res: Response) => {
  try {
    const { listUsableSearchProviderNames } = await import('../core/search/search-config');
    const providers = await listUsableSearchProviderNames();
    res.json({ providers });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/v1/search/providers/:name/test — 直连指定 Provider 测试（Admin 用） */
router.get('/providers/:name/test', async (req: Request, res: Response) => {
  try {
    const name = String(req.params.name || '').trim().toLowerCase();
    const query = String(req.query.q || 'test').trim() || 'test';
    const { SearchAggregator } = await import('../core/search/aggregator');
    const { isSearchProviderUsable } = await import('../core/search/search-config');
    const usable = await isSearchProviderUsable(name);
    if (!usable) {
      return res.status(400).json({ ok: false, error: `搜索引擎「${name}」未启用或未配置 Key` });
    }
    const impl = new SearchAggregator().getProvider(name);
    if (!impl) {
      return res.status(400).json({ ok: false, error: `不支持的搜索引擎: ${name}` });
    }
    const dimension = impl.supportedDimensions.includes('general')
      ? 'general'
      : impl.supportedDimensions[0] ?? 'general';
    const result = await impl.search({ query, dimension, numResults: 3 });
    const hitCount = result.items?.length ?? 0;
    if (hitCount === 0 && name === 'duckduckgo') {
      const reachable = await impl.healthCheck().catch(() => false);
      if (!reachable) {
        return res.json({
          ok: false,
          hitCount: 0,
          provider: name,
          query,
          error:
            '无法连接 DuckDuckGo（国内服务器通常无法直连，需配置 HTTP_PROXY/HTTPS_PROXY，或优先使用 Tavily）',
        });
      }
    }
    res.json({ ok: hitCount > 0, hitCount, provider: name, query });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/v1/search/health */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const { getAllSearchProviderConfigs } = await import('../core/search/search-config');
    const configs = await getAllSearchProviderConfigs();

    const providerStatus: Record<string, string> = {
      brave: 'missing',
      tavily: 'missing',
      anysearch: 'missing',
      arxiv: 'always-available',
      serpapi: 'missing',
      duckduckgo: 'always-available',
      bing: 'missing',
      bocha: 'missing',
    };

    for (const config of configs) {
      const keyless = config.name === 'arxiv' || config.name === 'duckduckgo';
      if (config.apiKeys && config.apiKeys.length > 0) {
        providerStatus[config.name] = config.enabled ? 'configured' : 'inactive';
      } else if (keyless) {
        providerStatus[config.name] = config.enabled ? 'configured' : 'inactive';
      }
    }

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      providers: providerStatus,
    });
  } catch (error) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      providers: {
        brave: 'missing',
        tavily: 'missing',
        arxiv: 'always-available',
      },
    });
  }
});

/** POST /api/v1/search/extract */
router.post('/extract', async (req: Request, res: Response) => {
  try {
    const { urls, prompt } = req.body;

    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'Missing required field: urls (array)' });
    }

    const service = getSearchService();
    const results = await service.deepSearchWithExtract({
      query: '',
      extractContent: true,
      extractDomains: [],
      extractPrompt: prompt,
      maxExtractCount: urls.length,
    });

    // 过滤出请求的 URLs
    const extracted = results.extractedContent.filter((e) => urls.includes(e.url));
    res.json({ extractedContent: extracted });
  } catch (error: any) {
    console.error('[Search API] POST /extract failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/v1/search/analyze */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { query, results } = req.body;

    if (!query || !results) {
      return res.status(400).json({ error: 'Missing required fields: query, results' });
    }

    // 简单的搜索结果分析
    const domains = (results as Array<{ domain: string }>).map((r) => r.domain);
    const domainCount: Record<string, number> = {};
    for (const d of domains) {
      domainCount[d] = (domainCount[d] || 0) + 1;
    }

    const topDomains = Object.entries(domainCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, count }));

    res.json({
      query,
      totalResults: results.length,
      topDomains,
      averageScore:
        results.reduce((sum: number, r: { score?: number }) => sum + (r.score || 0), 0) /
        results.length,
    });
  } catch (error: any) {
    console.error('[Search API] POST /analyze failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/v1/search/auto */
router.post('/auto', async (req: Request, res: Response) => {
  try {
    const { query, depth } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Missing required field: query' });
    }

    const service = getSearchService();
    const result = await service.autoSearch({
      query,
      depth: (depth as SearchDepth) || 'standard',
    });

    res.json(result);
  } catch (error: any) {
    console.error('[Search API] POST /auto failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Admin Routes ============

async function requireAdmin(req: Request, res: Response, next: () => void): Promise<void> {
  try {
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') {
      next();
      return;
    }
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const userRepo = RepositoryFactory.createUserRepository();
    const user = await userRepo.findById(userId);
    if (user && user.role === 'admin') {
      next();
      return;
    }
    res.status(403).json({ success: false, error: 'Admin access required' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to check admin' });
  }
}

/** GET /api/v1/admin/search/config - 获取所有搜索引擎配置 */
router.get('/admin/search/config', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { getAllSearchProviderConfigs } = await import('../core/search/search-config');
    const configs = await getAllSearchProviderConfigs();
    res.json({ items: configs });
  } catch (error) {
    console.error('[Search Admin] GET /config failed:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

/** POST /api/v1/search/admin/search/config - 保存搜索引擎配置 */
router.post('/admin/search/config', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { saveSearchProviderConfig } = await import('../core/search/search-config');
    const { task_key, enabled, apiKeys, rateLimit, extra } = req.body;

    if (!task_key) {
      return res.status(400).json({ error: 'Missing required field: task_key' });
    }

    const config = await saveSearchProviderConfig(task_key, {
      enabled,
      apiKeys: Array.isArray(apiKeys) ? apiKeys : [],
      rateLimit,
      extra,
    });

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('[Search Admin] POST /config failed:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// ============ Data Source Routes ============

/** POST /api/v1/search/datasource/query — 专业数据源结构化查询 */
router.post('/datasource/query', async (req: Request, res: Response) => {
  try {
    const { query, domain, queryType, symbol, limit } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Missing required field: query' });
    }
    const { DataSourceService } = await import('../core/data-sources/data-source-service');
    const service = new DataSourceService();
    const result = await service.query({ query, domain, queryType, symbol, limit });
    res.json(result);
  } catch (error: any) {
    console.error('[DataSource API] POST /datasource/query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/v1/search/datasource/combined — 网页检索 + 结构化数据并行 */
router.post('/datasource/combined', async (req: Request, res: Response) => {
  try {
    const { query, domain, depth } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Missing required field: query' });
    }
    const { DataSourceService } = await import('../core/data-sources/data-source-service');
    const service = new DataSourceService();
    const result = await service.combinedSearch(query, { domain, depth });
    res.json(result);
  } catch (error: any) {
    console.error('[DataSource API] POST /datasource/combined failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/v1/search/datasource/providers/enabled */
router.get('/datasource/providers/enabled', async (_req: Request, res: Response) => {
  try {
    const { listUsableDataSourceProviderNames } = await import('../core/data-sources/data-source-config');
    const providers = await listUsableDataSourceProviderNames();
    res.json({ providers });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/v1/search/datasource/health */
router.get('/datasource/health', async (_req: Request, res: Response) => {
  try {
    const { getAllDataSourceProviderConfigs } = await import('../core/data-sources/data-source-config');
    const configs = await getAllDataSourceProviderConfigs();
    const providerStatus: Record<string, string> = {
      coingecko: 'keyless',
      defillama: 'keyless',
      finnhub: 'missing',
      pkulaw: 'missing',
      tianyancha: 'missing',
    };
    for (const config of configs) {
      const keyless = config.name === 'coingecko' || config.name === 'defillama';
      if (config.apiKeys && config.apiKeys.length > 0) {
        providerStatus[config.name] = config.enabled ? 'configured' : 'inactive';
      } else if (keyless) {
        providerStatus[config.name] = config.enabled === false ? 'inactive' : 'keyless';
      }
    }
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), providers: providerStatus });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

/** GET /api/v1/search/admin/datasource/config */
router.get('/admin/datasource/config', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { getAllDataSourceProviderConfigs } = await import('../core/data-sources/data-source-config');
    const configs = await getAllDataSourceProviderConfigs();
    res.json({ items: configs });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

/** POST /api/v1/search/admin/datasource/config */
router.post('/admin/datasource/config', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { saveDataSourceProviderConfig } = await import('../core/data-sources/data-source-config');
    const { task_key, enabled, apiKeys, rateLimit, extra } = req.body;
    if (!task_key) {
      return res.status(400).json({ error: 'Missing required field: task_key' });
    }
    const config = await saveDataSourceProviderConfig(task_key, {
      enabled,
      apiKeys: Array.isArray(apiKeys) ? apiKeys : [],
      rateLimit,
      extra,
    });
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

/** GET /api/v1/search/datasource/providers/:name/test */
router.get('/datasource/providers/:name/test', async (req: Request, res: Response) => {
  try {
    const name = String(req.params.name || '').trim().toLowerCase();
    const query = String(req.query.q || 'test').trim() || 'test';
    const { isDataSourceProviderUsable } = await import('../core/data-sources/data-source-config');
    const { DataSourceService } = await import('../core/data-sources/data-source-service');
    const usable = await isDataSourceProviderUsable(name);
    if (!usable) {
      return res.status(400).json({ ok: false, error: `数据源「${name}」未启用或未配置 Key` });
    }
    const service = new DataSourceService();
    const provider = service.getProvider(name);
    if (!provider) {
      return res.status(400).json({ ok: false, error: `不支持的数据源: ${name}` });
    }
    const testQuery =
      name === 'finnhub' ? 'AAPL' : name === 'tianyancha' ? '北京百度网讯科技有限公司' : query;
    const result = await provider.query({ query: testQuery, domain: provider.domain });
    const hasData = Boolean(result.summary && result.summary.length > 10);
    res.json({ ok: hasData, provider: name, query: testQuery, summary: result.summary?.slice(0, 500) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/v1/search/stock-images — 免费图库混合检索（Pexels / Unsplash / Pixabay / Openverse） */
router.get('/stock-images', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      return res.status(400).json({ success: false, error: '缺少参数 q' });
    }
    const page = req.query.page != null ? Math.max(1, parseInt(String(req.query.page), 10) || 1) : 1;
    const pageSize =
      req.query.pageSize != null
        ? Math.min(30, Math.max(1, parseInt(String(req.query.pageSize), 10) || 20))
        : 20;

    const { searchStockImages } = await import('../core/stock-images/stock-images-service');
    const { data, provider, sources, attribution } = await searchStockImages({ query: q, page, pageSize });

    res.json({
      success: true,
      data,
      provider,
      sources,
      attribution,
    });
  } catch (error) {
    console.error('[Search API] GET /stock-images failed:', error);
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/** GET /api/v1/search/stock-videos — Pexels 免费视频素材（需 PEXELS_API_KEY） */
router.get('/stock-videos', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      return res.status(400).json({ success: false, error: '缺少参数 q' });
    }
    const page = req.query.page != null ? Math.max(1, parseInt(String(req.query.page), 10) || 1) : 1;
    const pageSize =
      req.query.pageSize != null
        ? Math.min(20, Math.max(1, parseInt(String(req.query.pageSize), 10) || 10))
        : 10;
    const preferWidth =
      req.query.preferWidth != null ? parseInt(String(req.query.preferWidth), 10) || undefined : undefined;

    const { searchStockVideos } = await import('../core/stock-images/stock-videos-service');
    const { data, provider, attribution } = await searchStockVideos({ query: q, page, pageSize, preferWidth });

    res.json({
      success: true,
      data,
      provider,
      attribution,
    });
  } catch (error) {
    console.error('[Search API] GET /stock-videos failed:', error);
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
