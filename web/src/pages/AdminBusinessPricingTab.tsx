
import {
  Alert,
  Button,
  Divider,
  Form,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import type { PromptConfigRow, TaskTemplateDraft } from './AdminBusiness.types';
import {
  GENERATE_PARAM_TOOLTIPS,
  RECOMMENDED_GENERATE_PARAMS,
  getBusinessTypeForPromptRow,
  mergeGenerateParams,
  readGenerateParams,
} from './AdminBusiness.utils';

export interface AdminBusinessPricingTabProps {
  selected: PromptConfigRow | null;
  routeProvider: string;
  routeModel: string;
  routeSaving: boolean;
  routeDirty: boolean;
  draft: TaskTemplateDraft | null;
  pricingForm: FormInstance<{
    margin: number;
    unit?: number;
    input?: number;
    output?: number;
    min_charge_tokens?: number;
  }>;
  pricingSaving: boolean;
  currentRoutableModels: Array<{ value: string; label: string }>;
  modelsByProviderByScope: Record<string, Record<string, string[]>>;
  onRouteProviderChange: (v: string) => void;
  onRouteModelChange: (v: string) => void;
  onSaveRoute: () => void;
  onClearRoute: () => void;
  onResetGenerateParams: () => void;
  onDraftChange: (v: TaskTemplateDraft | null | ((prev: TaskTemplateDraft | null) => TaskTemplateDraft | null)) => void;
  onSavePricing: () => void;
}

export function AdminBusinessPricingTab({
  selected,
  routeProvider,
  routeModel,
  routeSaving,
  routeDirty,
  draft,
  pricingForm,
  pricingSaving,
  currentRoutableModels,
  modelsByProviderByScope,
  onRouteProviderChange,
  onRouteModelChange,
  onSaveRoute,
  onClearRoute,
  onDraftChange,
  onSavePricing,
}: AdminBusinessPricingTabProps) {
  if (!selected) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Alert
        type="info"
        showIcon
        message="业务模型绑定 + MXM-TOKEN 定价"
        description="仅展示当前业务类别允许的模型（并且已启用且已配置 Provider 成本）。默认按 20% 收益自动换算，可手工调整。"
      />
      {routeDirty ? (
        <Alert
          type="warning"
          showIcon
          message="有未保存的模型路由变更"
          description={`你已修改 provider/model，但尚未点击「保存模型」，离开当前业务后这次变更不会生效。`}
        />
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
        <Select
          value={routeProvider || undefined}
          onChange={(v) => {
            onRouteProviderChange(v);
            onRouteModelChange('');
          }}
          placeholder="选择 Provider"
          options={Object.keys(modelsByProviderByScope).map((p) => ({ value: p, label: p }))}
        />
        <Select
          value={routeModel || undefined}
          onChange={onRouteModelChange}
          placeholder="选择物理模型（已启用+有价格）"
          options={currentRoutableModels}
          disabled={!routeProvider}
          showSearch
        />
        <Button type="primary" loading={routeSaving} onClick={onSaveRoute}>
          保存模型
        </Button>
      </div>
      <Space>
        <Button onClick={onClearRoute} loading={routeSaving}>
          恢复默认路由
        </Button>
        <Typography.Text type="secondary">
          business key: {getBusinessTypeForPromptRow(selected)}
        </Typography.Text>
      </Space>

      <Divider style={{ margin: '6px 0' }} />

      <Space wrap>
        <Button
          onClick={() => {
            onDraftChange({
              ...(draft ?? {
                formSchema: { type: 'object', properties: {}, required: [] },
                prompt: { unifiedTemplate: '' },
              }),
              extra: mergeGenerateParams(
                (draft?.extra ?? {}) as Record<string, unknown>,
                RECOMMENDED_GENERATE_PARAMS
              ),
            });
          }}
        >
          一键重置推荐值
        </Button>
        <Typography.Text type="secondary">
          推荐：temperature={RECOMMENDED_GENERATE_PARAMS.temperature}，maxTokens={RECOMMENDED_GENERATE_PARAMS.maxTokens}，topP={RECOMMENDED_GENERATE_PARAMS.topP}
        </Typography.Text>
      </Space>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Form.Item
          label="temperature（建议 0.3～0.6）"
          style={{ marginBottom: 0 }}
          tooltip={{ title: GENERATE_PARAM_TOOLTIPS.temperature }}
        >
          <InputNumber
            value={readGenerateParams(draft?.extra)?.temperature}
            min={0}
            max={2}
            step={0.05}
            style={{ width: '100%' }}
            placeholder="例如 0.5"
            onChange={(v) => {
              onDraftChange((prev) => {
                if (!prev) return prev;
                const prevExtra = (prev.extra ?? {}) as Record<string, unknown>;
                return {
                  ...prev,
                  extra: {
                    ...prevExtra,
                    generateParams: { ...(readGenerateParams(prevExtra) ?? {}), temperature: v ?? undefined },
                  },
                };
              });
            }}
          />
        </Form.Item>
        <Form.Item
          label="maxTokens（建议 1200～2000）"
          style={{ marginBottom: 0 }}
          tooltip={{ title: GENERATE_PARAM_TOOLTIPS.maxTokens }}
        >
          <InputNumber
            value={readGenerateParams(draft?.extra)?.maxTokens}
            min={1}
            max={200000}
            step={100}
            style={{ width: '100%' }}
            placeholder="例如 1600"
            onChange={(v) => {
              onDraftChange((prev) => {
                if (!prev) return prev;
                const prevExtra = (prev.extra ?? {}) as Record<string, unknown>;
                return {
                  ...prev,
                  extra: {
                    ...prevExtra,
                    generateParams: { ...(readGenerateParams(prevExtra) ?? {}), maxTokens: v ?? undefined },
                  },
                };
              });
            }}
          />
        </Form.Item>
        <Form.Item
          label="topP（建议 0.9～1）"
          style={{ marginBottom: 0 }}
          tooltip={{ title: GENERATE_PARAM_TOOLTIPS.topP }}
        >
          <InputNumber
            value={readGenerateParams(draft?.extra)?.topP}
            min={0}
            max={1}
            step={0.05}
            style={{ width: '100%' }}
            placeholder="例如 0.95"
            onChange={(v) => {
              onDraftChange((prev) => {
                if (!prev) return prev;
                const prevExtra = (prev.extra ?? {}) as Record<string, unknown>;
                return {
                  ...prev,
                  extra: {
                    ...prevExtra,
                    generateParams: { ...(readGenerateParams(prevExtra) ?? {}), topP: v ?? undefined },
                  },
                };
              });
            }}
          />
        </Form.Item>
      </div>

      <Divider style={{ margin: '6px 0' }} />

      <Form
        form={pricingForm}
        layout="vertical"
        initialValues={{ margin: 20, min_charge_tokens: 0 }}
        onValuesChange={(_changed) => {
          // Sync is handled by parent component via pricingSyncRef
        }}
      >
        <Form.Item name="margin" label="默认收益（%）" rules={[{ required: true, type: 'number', min: 0, max: 500 }]}>
          <InputNumber style={{ width: '100%' }} addonAfter="%" />
        </Form.Item>
      </Form>

      <Space>
        <Button type="primary" loading={pricingSaving} onClick={onSavePricing}>
          保存业务价格
        </Button>
      </Space>
    </div>
  );
}
