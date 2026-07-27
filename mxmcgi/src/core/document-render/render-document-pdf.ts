import { formatToPdf } from '../writing/document-formatter';
import type {
  DocumentPdfRenderer,
  DocumentRenderContext,
  DocumentRenderMeta,
  DocumentRenderSpecV1,
} from './types';
import { validateDocumentRenderSpec } from './validate-document-render-spec';
import { renderSpecToPdf } from './spec-pdf-renderer';
import { renderHtmlPrintToPdf } from './html-print-pdf-renderer';

export interface RenderDocumentPdfResult {
  buffer: Buffer;
  meta: DocumentRenderMeta;
  spec?: DocumentRenderSpecV1;
}

export async function renderDocumentPdfBuffer(options: {
  context: DocumentRenderContext;
  spec?: DocumentRenderSpecV1 | null;
  title?: string;
}): Promise<RenderDocumentPdfResult> {
  const { context, spec, title } = options;
  const renderer = context.renderer;

  if (spec) {
    const validated = validateDocumentRenderSpec(spec, renderer);
    if (validated.ok) {
      const mergedSpec: DocumentRenderSpecV1 = {
        ...validated.spec,
        assets: [...(validated.spec.assets ?? []), ...context.assets.filter(
          (a) => !(validated.spec.assets ?? []).some((x) => x.id === a.id)
        )],
      };

      if (renderer === 'html') {
        const buffer = await renderHtmlPrintToPdf(
          mergedSpec,
          context.markdown,
          context.structured
        );
        return {
          buffer,
          spec: mergedSpec,
          meta: {
            renderer,
            designStyle: context.designStyle,
            backend: 'html-print',
          },
        };
      }

      if (renderer === 'styled') {
        const buffer = await renderSpecToPdf(
          mergedSpec,
          context.markdown,
          context.structured
        );
        return {
          buffer,
          spec: mergedSpec,
          meta: {
            renderer,
            designStyle: context.designStyle,
            backend: 'pdfkit-spec',
          },
        };
      }

      // markdown renderer with minimal spec: still use markdown path for body
      const body =
        mergedSpec.blocks.find((b) => b.type === 'markdown' || b.type === 'section') != null
          ? context.markdown
          : context.markdown;
      const buffer = await formatToPdf(body, title);
      return {
        buffer,
        spec: mergedSpec,
        meta: {
          renderer,
          designStyle: context.designStyle,
          backend: 'pdfkit-markdown',
        },
      };
    }
  }

  const buffer = await formatToPdf(context.markdown, title);
  return {
    buffer,
    meta: {
      renderer: 'markdown',
      designStyle: context.designStyle,
      backend: 'pdfkit-markdown',
      usedFallback: renderer !== 'markdown',
    },
  };
}
