/**
 * 助手项目数据模型
 */

export interface AgentProject {
  id: string;
  project_no: string;
  agent_id: string;
  user_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  input_payload?: Record<string, any>;
  output_summary?: Record<string, any>;
  error_message?: string;
  started_at?: Date | string;
  completed_at?: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AgentProjectStep {
  id: string;
  project_id: string;
  step_key: string;
  step_name?: string;
  order_index?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  depends_on?: string[];
  mxmcgi_task_id?: string;
  input_payload?: Record<string, any>;
  output_payload?: Record<string, any>;
  error_message?: string;
  queued_at?: Date | string;
  started_at?: Date | string;
  completed_at?: Date | string;
}

export interface AgentProjectWithSteps extends AgentProject {
  steps?: AgentProjectStep[];
}

export interface ProjectQueryOptions {
  agent_id?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at' | 'completed_at';
  order?: 'asc' | 'desc';
  include_steps?: boolean;
}

