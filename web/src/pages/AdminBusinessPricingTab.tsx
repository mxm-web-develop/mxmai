/**
 * 业务「模型配置」Tab：绑定 Provider/物理模型 + 文本生成参数。
 * 用户扣费以 Provider 管理中的 platform_* 为准，此处不再编辑 business_pricing。
 */
import { Alert, Button, Divider, Form, InputNumber, Select, Space, Typography } from 'antd';
import type { PromptConfigRow, TaskTemplateDraft } from './AdminBusiness.types';
import type { ProviderRoutingEntry } from '../api/client';
import {
  GENERATE_PARAM_TOOLTIPS,
  RECOMMENDED_GENERATE_PARAMS,
  formatVideoGeneratorRouteValue,
  getBusinessTypeForPromptRow,
  isVideoPipelineOrchestratorBusiness,
  mergeGenerateParams,
  parseVideoGeneratorRouteValue,
  patchGenerateParamsExtra,
  readAiVideoGeneratorRoute,
  readGenerateParams,
  routableProviderOptions,
  syncAiVideoGeneratorToPipelineDraft,
  videoGeneratorBusinessOptions,
} from './AdminBusiness.utils';
import { PageHint, PageHintsBar } from '../components/PageHint';

export interface PlatformPriceSummary {
  chargeMode: string;
  /** 可读摘要，如 in:0.075 / out:0.3 或 unit:0.875 */
  label: string;
}

export interface AdminBusinessPricingTabProps {
  selected: PromptConfigRow | null;
  extraDraft: Record<string, unknown>;
  videoGeneratorBusinesses: PromptConfigRow[];
  routing: Record<string, ProviderRoutingEntry>;
  routeProvider: string;
  routeModel: string;
  routeDirty: boolean;
  draft: TaskTemplateDraft | null;
  /** 当前所选物理模型的 MXM-TOKEN 单价摘要（只读，来自 provider_pricing.platform_*） */
  platformPriceSummary: PlatformPriceSummary | null;
  currentRoutableModels: Array<{ value: string; label: string }>;
  modelsByProviderByScope: Record<string, Record<string, string[]>>;
  onRouteProviderChange: (v: string) => void;
  onRouteModelChange: (v: string) => void;
  onSaveRoute: () => void;
  onDraftChange: (
    v: TaskTemplateDraft | null | ((prev: TaskTemplateDraft | null) => TaskTemplateDraft | null),
  ) => void;
  onExtraDraftChange: (
    v: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>),
  ) => void;
}

export function AdminBusinessPricingTab({
  selected,
  extraDraft,
  videoGeneratorBusinesses,
  routing,
  routeProvider,
  routeModel,
  routeDirty,
  draft,
  platformPriceSummary,
  currentRoutableModels,
  modelsByProviderByScope,
  onRouteProviderChange,
  onRouteModelChange,
  onSaveRoute,
  onDraftChange,
  onExtraDraftChange,
}: AdminBusinessPricingTabProps) {
  if (!selected) return null;

  const TEXT_SCOPES = ['text', 'writing'];
  const showGenerateParams = TEXT_SCOPES.includes(selected.scope);
  const isPipelineOrchestrator = isVideoPipelineOrchestratorBusiness(extraDraft, selected);

  const generatorSelectOptions = videoGeneratorBusinessOptions(videoGeneratorBusinesses);
  const aiVideoRoute = readAiVideoGeneratorRoute(extraDraft);
  const aiVideoRouteValue = formatVideoGeneratorRouteValue(aiVideoRoute.taskKey, aiVideoRoute.subtype);

  const generatorRouting = (() => {
    const genRow = videoGeneratorBusinesses.find(
      (r) => formatVideoGeneratorRouteValue(r.type, r.subtype) === aiVideoRouteValue,
    );
    if (!genRow) return null;
    const logical = getBusinessTypeForPromptRow(genRow);
    const resolved = routing[logical];
    if (!resolved?.provider || !resolved?.model) return null;
    return resolved;
  })();

  const providerOptions = routableProviderOptions(modelsByProviderByScope);

  const handleAiGeneratorChange = (routeValue: string) => {
    const parsed = parseVideoGeneratorRouteValue(routeValue);
    onExtraDraftChange((prev) => ({
      ...prev,
      defaultAiVideoGenerator: parsed,
      aiVideoRoute: {
        taskKey: parsed.taskKey,
        subtype: parsed.subtype,
        note: '时间轴 AI 视频块默认路由；可在审核 UI 按镜头切换其他 generator 业务',
      },
    }));
    onDraftChange((prev) => (prev ? syncAiVideoGeneratorToPipelineDraft(prev, parsed) : prev));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isPipelineOrchestrator ? (
        <>
          <Alert
            type="info"
            showIcon
            title="自动剪辑编排业务"
            description="本业务是管线编排入口，不在此处绑定外部视频模型。下方选择时间轴上 AI 视频块默认调用的 video/generator 子业务；其实际 Provider / 模型由该子业务在「模型配置」中绑定。"
          />
          <Form.Item
            label="AI 视频块默认生成业务"
            required
            tooltip="分镜里 mxmRenderMode=ai-video-gen 的片段将 nested 调用此 video/generator 业务；审核时可按镜头改选"
          >
            <Select
              value={
                generatorSelectOptions.some((o) => o.value === aiVideoRouteValue)
                  ? aiVideoRouteValue
                  : undefined
              }
              onChange={handleAiGeneratorChange}
              placeholder="选择 video/generator 子业务"
              options={generatorSelectOptions}
              showSearch
              optionFilterProp="label"
              notFoundContent="请先在 Video 分类下上架 generator 子业务（如 fragment）"
            />
          </Form.Item>
          {generatorRouting ? (
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              当前 AI 块将使用：
              <Typography.Text code>
                {generatorRouting.provider} / {generatorRouting.model}
              </Typography.Text>
              （来自所选 generator 业务的路由，只读）
            </Typography.Text>
          ) : (
            <Typography.Text type="warning" style={{ fontSize: 12, display: 'block' }}>
              所选 generator 业务尚未配置 Provider 路由，请打开对应业务完成「模型配置」。
            </Typography.Text>
          )}
        </>
      ) : (
        <>
          <PageHintsBar>
            <PageHint
              title="业务模型绑定"
              description="选择 Provider 与物理模型并保存。用户扣费取自「Provider 管理」中该模型的 MXM-TOKEN，不在本页单独设价。"
            />
            {routeDirty ? (
              <PageHint
                tone="warning"
                emphasis
                title="有未保存的模型路由变更"
                description="你已修改 provider/model，但尚未点击「保存模型」，离开当前业务后这次变更不会生效。"
              />
            ) : null}
          </PageHintsBar>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Select
              value={routeProvider || undefined}
              onChange={(v) => {
                onRouteProviderChange(v);
                onRouteModelChange('');
              }}
              placeholder="选择 Provider"
              options={providerOptions}
            />
            <Select
              value={routeModel || undefined}
              onChange={onRouteModelChange}
              placeholder="选择物理模型（已启用+已配置 MXM-TOKEN）"
              options={currentRoutableModels}
              disabled={!routeProvider}
              showSearch
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              disabled={!routeProvider || !routeModel || !routeDirty}
              onClick={onSaveRoute}
            >
              保存模型
            </Button>
          </div>
          {routeProvider && routeModel && !platformPriceSummary ? (
            <Alert
              type="error"
              showIcon
              title="未配置 MXM-TOKEN"
              description="该物理模型在 Provider 管理中缺少 MXM-TOKEN 单价，用户将无法生成。请先在「模型价格」中配置。"
            />
          ) : null}
        </>
      )}

      {showGenerateParams ? (
        <>
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
                    RECOMMENDED_GENERATE_PARAMS,
                  ),
                });
              }}
            >
              一键重置推荐值
            </Button>
            <Typography.Text type="secondary">
              推荐：temperature={RECOMMENDED_GENERATE_PARAMS.temperature}，maxTokens=
              {RECOMMENDED_GENERATE_PARAMS.maxTokens}，topP={RECOMMENDED_GENERATE_PARAMS.topP}
              ，模型思考=关闭
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
                      extra: patchGenerateParamsExtra(prevExtra, {
                        temperature: v ?? undefined,
                      }),
                    };
                  });
                }}
              />
            </Form.Item>
            <Form.Item
              label="maxTokens（建议 8k～65k，视任务；模型上限约 128k）"
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
                      extra: patchGenerateParamsExtra(prevExtra, {
                        maxTokens: v ?? undefined,
                      }),
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
                      extra: patchGenerateParamsExtra(prevExtra, {
                        topP: v ?? undefined,
                      }),
                    };
                  });
                }}
              />
            </Form.Item>
            <Form.Item
              label="模型思考（成稿建议关闭）"
              style={{ marginBottom: 0 }}
              tooltip={{ title: GENERATE_PARAM_TOOLTIPS.enableThinking }}
              extra={
                readGenerateParams(draft?.extra)?.enableThinking === undefined ? (
                  <Typography.Text type="warning">
                    未写入业务配置。请显性选择；运行时不会再偷偷默认关思考。
                  </Typography.Text>
                ) : undefined
              }
            >
              <Select
                allowClear={false}
                value={
                  readGenerateParams(draft?.extra)?.enableThinking === true
                    ? 'adaptive'
                    : readGenerateParams(draft?.extra)?.enableThinking === false
                      ? 'disabled'
                      : undefined
                }
                placeholder="未配置 — 请显性选择"
                style={{ width: '100%' }}
                options={[
                  { value: 'disabled', label: '关闭（推荐成稿路径）' },
                  { value: 'adaptive', label: '开启（adaptive）' },
                ]}
                onChange={(v) => {
                  onDraftChange((prev) => {
                    if (!prev) return prev;
                    const prevExtra = (prev.extra ?? {}) as Record<string, unknown>;
                    return {
                      ...prev,
                      extra: patchGenerateParamsExtra(prevExtra, {
                        enableThinking: v === 'adaptive',
                      }),
                    };
                  });
                }}
              />
            </Form.Item>
          </div>
        </>
      ) : null}
    </div>
  );
}
