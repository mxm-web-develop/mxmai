interface PlainTextReaderProps {
  content: string;
}

export function PlainTextReader({ content }: PlainTextReaderProps) {
  return <pre className="doc-reader-plain">{content || '暂无内容'}</pre>;
}
