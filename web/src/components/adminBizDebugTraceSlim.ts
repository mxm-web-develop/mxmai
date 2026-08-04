/**
 * Admin 调试时间轴：兼容旧「整份合同」快照。
 * 新跑次后端写 pipeline-step-io/v1（config + resolved/produced），此处原样透传。
 * 禁止按业务字段（industry 等）写死精简逻辑。
 */

export type TraceIoKind = 'input' | 'output';

function isV1(o: Record<string, unknown>): boolean {
  return o._schema === 'pipeline-step-io/v1' || (o.config != null && (o.resolved != null || o.produced != null));
}

/** 旧 used/produced 半成品也透传 */
function isSemiCanonical(o: Record<string, unknown>, kind: TraceIoKind): boolean {
  if (kind === 'input' && o.used != null && o.produced == null) return true;
  if (kind === 'output' && o.produced != null) return true;
  return false;
}

/**
 * 历史整包合同：只保留节点配置片段，不猜业务字段。
 */
function slimLegacyFat(step: string, o: Record<string, unknown>, kind: TraceIoKind): unknown {
  const stepParams = o.stepParams ?? o.params;
  const config = {
    step: o.step ?? step,
    when: o.when ?? null,
    nestedTextTaskKey: o.nestedTextTaskKey ?? null,
    inputMapping: o.inputMapping ?? null,
    params: stepParams && typeof stepParams === 'object' ? stepParams : {},
  };

  if (kind === 'output') {
    const evidence =
      o.evidence && typeof o.evidence === 'object' ? (o.evidence as Record<string, unknown>) : {};
    const evidenceKeys = Object.keys(evidence);
    return {
      _schema: 'pipeline-step-io/legacy',
      _note: '历史输出快照已折叠：仅保留节点配置与证据键名；请重新调试以得到 config+produced',
      config: {
        step: config.step,
        params: {
          target: (config.params as Record<string, unknown>)?.target,
          commitPaths: (config.params as Record<string, unknown>)?.commitPaths,
          targetZone: (config.params as Record<string, unknown>)?.targetZone,
          targetField: (config.params as Record<string, unknown>)?.targetField,
        },
      },
      produced: {
        evidenceKeys,
        hasContract: o.contract != null,
      },
    };
  }

  return {
    _schema: 'pipeline-step-io/legacy',
    _note: '历史输入快照已折叠：仅保留节点配置；请重新调试以得到 config+resolved',
    config,
    resolved: {
      _hint: '旧 trace 未按声明路径解析；完整合同已省略',
      evidenceKeys:
        o.evidence && typeof o.evidence === 'object'
          ? Object.keys(o.evidence as object)
          : [],
      contractZones:
        o.contract && typeof o.contract === 'object'
          ? Object.keys(o.contract as object)
          : [],
    },
  };
}

export function slimTraceIoForDisplay(
  step: string,
  value: unknown,
  kind: TraceIoKind = 'input'
): unknown {
  if (value == null) return value;
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  const o = value as Record<string, unknown>;

  if (isV1(o)) return value;
  if (isSemiCanonical(o, kind)) return value;

  // 误把输入精简结果当输出
  if (kind === 'output' && o.used != null && o.produced == null) {
    return {
      _schema: 'pipeline-step-io/legacy',
      _note: '历史输出曾被误标为输入摘要；请重新调试',
      config: { step: o.step ?? step },
      produced: { legacyUsed: o.used },
    };
  }

  if (o.contract != null || o.evidence != null) {
    return slimLegacyFat(step, o, kind);
  }

  return value;
}
