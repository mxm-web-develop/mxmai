import type { OpenApiPort, PublishedApiManifest, RunBody, RunResponse, ServiceSummary, JobStatus } from './types';
import {
  createMockJob,
  getManifestBySlug,
  getMockJob,
  listMockJobs,
  listServiceSummaries,
} from '@/lib/mock/job-simulator';
import { listProjectListItems } from '@/lib/project/project-store';

export class MockOpenApiAdapter implements OpenApiPort {
  async listServices(): Promise<ServiceSummary[]> {
    return listServiceSummaries();
  }

  async getManifest(slug: string): Promise<PublishedApiManifest> {
    return getManifestBySlug(slug);
  }

  async run(slug: string, body: RunBody): Promise<RunResponse> {
    return createMockJob(slug, body);
  }

  async getJob(_slug: string, jobId: string): Promise<JobStatus> {
    const job = await getMockJob(jobId);
    if (!job) throw new Error(`任务不存在：${jobId}`);
    return job;
  }

  async listJobs(): Promise<JobStatus[]> {
    return listMockJobs();
  }

  async listProjects() {
    return listProjectListItems();
  }
}
