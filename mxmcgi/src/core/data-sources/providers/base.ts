import type { DataSourceRequest, DataSourceResult } from '../types';

export interface DataSourceProvider {
  readonly name: string;
  readonly domain: import('../types').DataDomain;
  query(request: DataSourceRequest): Promise<DataSourceResult>;
  healthCheck(): Promise<boolean>;
}
