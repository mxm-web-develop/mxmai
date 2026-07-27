/**
 * @deprecated 已由 WritingCreateWizard 取代。保留文件仅作兼容 re-export，勿再挂载本组件。
 * 旧实现会一进抽屉就 TaskBillingBar +「确认并继续」，并曾因 params={{}} 死循环刷 estimate。
 */
export {
  indicatesWarpGatesCreate,
  schemaIndicatesWarpGuidedCreate,
  shouldUseWritingWarpGuidedCreate,
  needsCreateGuideClientWebSearchPreview,
} from './writingCreateUx';

/** @deprecated 请使用 WritingCreateWizard */
export function WritingWarpGuidedCreate(_props: Record<string, unknown>) {
  return (
    <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
      此引导组件已废弃，请关闭抽屉后重新打开「新建写作任务」。
    </p>
  );
}
