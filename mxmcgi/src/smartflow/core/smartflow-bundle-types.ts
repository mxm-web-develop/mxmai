/** 与 Admin / CLI `mxm-smartflow-bundle` JSON 对齐 */

import type { SmartflowSchema } from './models/types';

export type SmartflowBundleItem = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  status?: 'active' | 'inactive' | 'draft' | 'deprecated';
  version?: string;
  is_public?: boolean;
  schema: SmartflowSchema;
};

export type SmartflowBundle = {
  schemaVersion: 1;
  kind: 'mxm-smartflow-bundle';
  exportedAt: string;
  items: SmartflowBundleItem[];
};

export type SmartflowBundleImportPolicy = 'upsert' | 'skip' | 'dry-run';

export type SmartflowBundleImportResult = {
  created: string[];
  updated: string[];
  skipped: string[];
  warnings: string[];
};
