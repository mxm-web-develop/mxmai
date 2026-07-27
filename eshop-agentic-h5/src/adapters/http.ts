import type { OpenApiPort, PublishedApiManifest, RunBody, RunResponse, ServiceSummary, JobStatus } from './types';
import { enrichManifestWithLocalUi, getLocalManifestBySlug, getManifestBySlug } from '@/catalog/manifests';
import { listPublicServices } from '@/catalog/services';
import { normalizePlatformJob } from '@/lib/platform-job';
import { listProjectListItems, patchPlatformJobFromJobStatus, getPlatformJob } from '@/lib/project/project-store';
import { syncProjectsFromCloud, type RemoteOpenApiJob } from '@/lib/project/project-sync';
import { enrichJobWithTaskFolder, loadResultsFromTaskFolder, syncTaskFolderAssets } from '@/lib/task-folder/sync';
import { taskFolderPath } from '@/lib/task-folder/types';
import { isStaleTaskFolderRemoteUrl } from '@/lib/media-url';

function pickManifestFromApi(data: Record<string, unknown>, slug: string): PublishedApiManifest {
  return {
    slug,
    title: String(data.title ?? slug),
    description: data.description != null ? String(data.description) : null,
    kind: (data.kind as PublishedApiManifest['kind']) ?? 'task_v2',
    schemaVersion: Number(data.schemaVersion ?? 1),
    inputSchema: (data.inputSchema ?? { type: 'object', properties: {} }) as PublishedApiManifest['inputSchema'],
    inputDoc: (data.inputDoc ?? {}) as PublishedApiManifest['inputDoc'],
    platformRef: data.platformRef as PublishedApiManifest['platformRef'],
  };
}

/**
 * Phase 2: HTTP → Gateway Open API（slug 与 Admin 发布一致）
 */
export class HttpOpenApiAdapter implements OpenApiPort {
  private baseUrl: string;
  private getToken: () => string | null;
  private ensureAuth?: () => Promise<void>;

  constructor(options?: {
    baseUrl?: string;
    getApiKey?: () => string | null;
    getToken?: () => string | null;
    ensureAuth?: () => Promise<void>;
  }) {
    this.baseUrl = (options?.baseUrl ?? '').replace(/\/$/, '');
    this.getToken = options?.getToken ?? options?.getApiKey ?? (() => null);
    this.ensureAuth = options?.ensureAuth;
  }

  private headers(): HeadersInit {
    const token = this.getToken();
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token?.trim()) h['Authorization'] = `Bearer ${token.trim()}`;
    return h;
  }

  private async authHeaders(): Promise<HeadersInit> {
    if (this.ensureAuth) await this.ensureAuth();
    return this.headers();
  }

  private resolveBase(): string {
    if (this.baseUrl) return this.baseUrl;
    if (typeof window !== 'undefined') return window.location.origin;
    throw new Error('未配置 API 地址：请在「我的」填写 Gateway 地址（如 http://localhost:3000）');
  }

  private apiUrl(path: string): string {
    const base = this.resolveBase().replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async request(input: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(input, init);
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(
          '无法连接 API（Failed to fetch）。请确认 Gateway 已启动（pnpm dev:all），并重启 H5；本地开发已走同源 /api 代理，勿在设置里写死 http://localhost:3000 除非已配置 CORS'
        );
      }
      throw e;
    }
  }

  async getJobRaw(slug: string, jobId: string): Promise<Record<string, unknown>> {
    return this.fetchJobRaw(slug, jobId);
  }

  private async fetchJobRaw(slug: string, jobId: string): Promise<Record<string, unknown>> {
    const res = await this.request(
      this.apiUrl(`/api/v1/open/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobId)}`),
      { headers: await this.authHeaders() }
    );
    if (res.status === 401) {
      throw new Error('会话无效，请重新打开应用');
    }
    if (!res.ok) throw new Error(`查询任务失败：${res.status}`);
    const json = await res.json();
    return (json.data ?? json) as Record<string, unknown>;
  }

  async listServices(): Promise<ServiceSummary[]> {
    return listPublicServices();
  }

  async getManifest(slug: string): Promise<PublishedApiManifest> {
    try {
      const res = await this.request(this.apiUrl(`/api/v1/open/${encodeURIComponent(slug)}`), {
        headers: await this.authHeaders(),
      });
      if (res.status === 401) {
        throw new Error('会话无效，请重新打开应用');
      }
      if (res.ok) {
        const json = await res.json();
        const data = (json.data ?? json) as Record<string, unknown>;
        if (data.inputSchema) {
          return enrichManifestWithLocalUi(pickManifestFromApi(data, slug));
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('API Key')) throw e;
      console.warn('[Open API] manifest 拉取失败，使用本地 formSchema 兜底:', slug, e);
    }
    const local = getLocalManifestBySlug(slug);
    if (local) return local;
    return getManifestBySlug(slug);
  }

  async run(slug: string, body: RunBody): Promise<RunResponse> {
    const apiPayload =
      'params' in body
        ? { params: body.params }
        : { input_data: body.input_data };

    const res = await this.request(this.apiUrl(`/api/v1/open/${encodeURIComponent(slug)}/run`), {
      method: 'POST',
      headers: await this.authHeaders(),
      body: JSON.stringify(apiPayload),
    });
    if (res.status === 401) {
      throw new Error('会话无效，请重新打开应用');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        String((err as { message?: string }).message ?? `提交任务失败：${res.status}`)
      );
    }
    const json = await res.json();
    return json.data as RunResponse;
  }

  async getJob(slug: string, jobId: string): Promise<JobStatus> {
    const raw = await this.fetchJobRaw(slug, jobId);
    const manifest = await this.getManifest(slug);

    const platformJob = await getPlatformJob(slug, jobId);
    const { job, mediaUrls } = await normalizePlatformJob(slug, jobId, raw, {
      kind: manifest.kind,
      fetchChild: (childId) => this.fetchJobRaw(slug, childId),
    });

    let jobWithName: JobStatus = { ...job };
    if (platformJob) {
      jobWithName = {
        ...job,
        displayName: platformJob.displayName ?? job.displayName,
        outputGrid: job.outputGrid ?? platformJob.outputGrid,
      };
    }

    await patchPlatformJobFromJobStatus(jobWithName);

    const apiHasResults = Boolean(job.results?.length) || mediaUrls.length > 0;
    const assetCount = platformJob?.assetCount ?? 0;

    if (job.status === 'completed' && assetCount > 0 && apiHasResults) {
      const results = await loadResultsFromTaskFolder(jobId);
      const staleCache = results.some((r) => {
        const u = r.remoteUrl ?? r.url;
        return typeof u === 'string' && isStaleTaskFolderRemoteUrl(u);
      });
      if (!staleCache && results.length > 0) {
        return enrichJobWithTaskFolder({
          ...jobWithName,
          results,
          assetCount: results.length,
          taskFolderPath: taskFolderPath(jobId),
        });
      }
      if (staleCache && mediaUrls.length > 0) {
        const synced = await syncTaskFolderAssets(jobId, slug, job.title, manifest.kind, mediaUrls, {
          status: job.status,
          progress: job.progress,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          outputGrid: job.outputGrid,
          error: job.error,
          children: job.children?.map((c) => ({
            id: c.id,
            label: c.label,
            status: c.status,
            progress: c.progress,
          })),
        });
        const enriched = await enrichJobWithTaskFolder({
          ...jobWithName,
          results: synced,
          assetCount: synced.length,
        });
        await patchPlatformJobFromJobStatus(enriched);
        return enriched;
      }
    }

    if (job.status === 'completed' && mediaUrls.length > 0) {
      const hasLocal =
        job.results?.some((r) => r.localUrl || r.url.startsWith('blob:')) ?? false;
      if (!hasLocal || (job.results?.length ?? 0) < mediaUrls.length) {
        const synced = await syncTaskFolderAssets(jobId, slug, job.title, manifest.kind, mediaUrls, {
          status: job.status,
          progress: job.progress,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          outputGrid: job.outputGrid,
          error: job.error,
          children: job.children?.map((c) => ({
            id: c.id,
            label: c.label,
            status: c.status,
            progress: c.progress,
          })),
        });
        const enriched = await enrichJobWithTaskFolder({
          ...jobWithName,
          results: synced,
          assetCount: synced.length,
        });
        await patchPlatformJobFromJobStatus(enriched);
        return enriched;
      }
    }

    return enrichJobWithTaskFolder(jobWithName);
  }

  async listProjects() {
    await syncProjectsFromCloud();
    return listProjectListItems();
  }

  async syncProjects(opts?: { force?: boolean }) {
    return syncProjectsFromCloud(opts);
  }

  async listRemoteJobs(cursor = 0, limit = 50): Promise<{
    jobs: RemoteOpenApiJob[];
    nextCursor: number | null;
  }> {
    if (this.ensureAuth) await this.ensureAuth();
    const token = this.getToken();
    const url = new URL(this.apiUrl('/api/v1/open/jobs'));
    url.searchParams.set('rootOnly', 'true');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('cursor', String(cursor));
    const res = await this.request(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : await this.authHeaders(),
    });
    if (!res.ok) throw new Error(`拉取任务列表失败：${res.status}`);
    const json = await res.json();
    const data = json.data ?? json;
    return {
      jobs: (data.jobs ?? []) as RemoteOpenApiJob[],
      nextCursor: data.nextCursor ?? null,
    };
  }

  async listJobs(): Promise<JobStatus[]> {
    await syncProjectsFromCloud();
    const projects = await listProjectListItems();
    return Promise.all(
      projects.map(async (p) => {
        const shootId = p.rootPlatformJobId;
        const results =
          p.status === 'completed' && (p.assetCount ?? 0) > 0
            ? await loadResultsFromTaskFolder(shootId)
            : undefined;
        return {
          jobId: shootId,
          slug: p.shootSlug,
          title: p.title,
          displayName: p.title,
          status: p.status,
          progress: p.progress,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          results,
          outputGrid: p.outputGrid,
          parallelCount: p.parallelCount,
          taskFolderPath: taskFolderPath(shootId),
          assetCount: p.assetCount,
          error: p.error,
          projectId: p.projectId,
        } satisfies JobStatus & { projectId: string };
      })
    );
  }

  /** Open API SSE：任务进度（fetch + ReadableStream，支持 Authorization） */
  subscribeJobEvents(
    slug: string,
    jobId: string,
    onEvent: (event: string, data: unknown) => void,
    signal?: AbortSignal
  ): void {
    void (async () => {
      if (this.ensureAuth) await this.ensureAuth();
      const token = this.getToken();
      const url = this.apiUrl(
        `/api/v1/open/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobId)}/events`
      );
      const res = await this.request(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      });
      if (!res.ok || !res.body) {
        onEvent('error', { message: `SSE failed: ${res.status}` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const block of parts) {
          const lines = block.split('\n');
          let ev = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) ev = line.slice(6).trim();
            if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (data) {
            try {
              onEvent(ev, JSON.parse(data));
            } catch {
              onEvent(ev, data);
            }
          }
        }
      }
    })().catch((e) => onEvent('error', { message: String(e) }));
  }
}
