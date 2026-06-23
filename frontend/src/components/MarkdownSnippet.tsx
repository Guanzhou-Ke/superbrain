import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const snippetComponents = {
  p: (props: React.ComponentProps<'p'>) => <p style={{ margin: 0 }} {...props} />,
  ul: (props: React.ComponentProps<'ul'>) => <ul style={{ margin: '0 0 0 16px', padding: 0 }} {...props} />,
  ol: (props: React.ComponentProps<'ol'>) => <ol style={{ margin: '0 0 0 16px', padding: 0 }} {...props} />,
  li: (props: React.ComponentProps<'li'>) => <li style={{ margin: '2px 0' }} {...props} />,
  code: ({ className, ...props }: React.ComponentProps<'code'>) => (
    <code
      className={className}
      style={{
        background: className ? 'transparent' : '#f1f5f9',
        borderRadius: className ? 0 : '4px',
        padding: className ? 0 : '1px 4px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.92em',
      }}
      {...props}
    />
  ),
  pre: (props: React.ComponentProps<'pre'>) => (
    <pre
      style={{
        overflowX: 'auto',
        background: '#f8fafc',
        color: '#0f172a',
        border: '1px solid #e2e8f0',
        padding: '8px 10px',
        borderRadius: '8px',
        fontSize: '12px',
        lineHeight: 1.5,
        margin: '4px 0 0',
      }}
      {...props}
    />
  ),
};

export function MarkdownSnippet({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeSanitize, rehypeKatex]}
      components={snippetComponents}
    >
      {normalizeMathBlocks(text)}
    </ReactMarkdown>
  );
}

function normalizeMathBlocks(text: string): string {
  return text.replace(/^\s*\$\$(.+?)\$\$\s*$/gm, (_, formula: string) => `$$\n${formula.trim()}\n$$`);
}
