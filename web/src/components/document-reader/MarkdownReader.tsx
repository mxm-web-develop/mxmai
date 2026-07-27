import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownReaderProps {
  content: string;
}

export function MarkdownReader({ content }: MarkdownReaderProps) {
  return (
    <div className="doc-reader-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
