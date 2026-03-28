export interface ProviderModel {
  id: string;
  provider: string;
  scope: string;
  model_key: string;
  upstream_model: string | null;
  protocol: string | null;
  modality: string | null;
  io_schema: string | null;
  display_name: string | null;
  description: string | null;
  capabilities: Record<string, unknown> | null;
  default_parameters: Record<string, unknown> | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

