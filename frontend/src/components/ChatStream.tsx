import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { BubbleState, MentorInfo } from '../bubbles';

export type ChatRunStatus = 'idle' | 'routing' | 'streaming' | 'synthesizing' | 'reviewing';

interface ChatStreamProps {
  bubbles: BubbleState[];
  mentorsById: Map<string, MentorInfo>;
  status?: ChatRunStatus;
  progressDetail?: string | null;
}

const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => <h1 style={markdownStyles.h1} {...props} />,
  h2: (props: React.ComponentProps<'h2'>) => <h2 style={markdownStyles.h2} {...props} />,
  h3: (props: React.ComponentProps<'h3'>) => <h3 style={markdownStyles.h3} {...props} />,
  p: (props: React.ComponentProps<'p'>) => <p style={markdownStyles.p} {...props} />,
  ul: (props: React.ComponentProps<'ul'>) => <ul style={markdownStyles.list} {...props} />,
  ol: (props: React.ComponentProps<'ol'>) => <ol style={markdownStyles.list} {...props} />,
  blockquote: (props: React.ComponentProps<'blockquote'>) => <blockquote style={markdownStyles.blockquote} {...props} />,
  code: ({ className, ...props }: React.ComponentProps<'code'>) => (
    <code
      className={className}
      style={className ? markdownStyles.codeBlockCode : markdownStyles.code}
      {...props}
    />
  ),
  pre: (props: React.ComponentProps<'pre'>) => <pre style={markdownStyles.pre} {...props} />,
  table: (props: React.ComponentProps<'table'>) => <table style={markdownStyles.table} {...props} />,
  th: (props: React.ComponentProps<'th'>) => <th style={markdownStyles.th} {...props} />,
  td: (props: React.ComponentProps<'td'>) => <td style={markdownStyles.td} {...props} />,
};

const markdownStyles: Record<string, CSSProperties> = {
  h1: { fontSize: '20px', margin: '0 0 12px', lineHeight: 1.25 },
  h2: { fontSize: '16px', margin: '16px 0 8px', lineHeight: 1.35 },
  h3: { fontSize: '14px', margin: '12px 0 6px', lineHeight: 1.35 },
  p: { margin: '0 0 10px' },
  list: { margin: '0 0 10px 20px', padding: 0 },
  blockquote: {
    margin: '8px 0',
    padding: '8px 12px',
    borderLeft: '3px solid #cbd5e1',
    background: '#f8fafc',
  },
  code: {
    background: '#f1f5f9',
    borderRadius: '4px',
    padding: '1px 4px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.92em',
  },
  pre: {
    overflowX: 'auto',
    background: '#f8fafc',
    color: '#0f172a',
    border: '1px solid #e2e8f0',
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  codeBlockCode: {
    background: 'transparent',
    padding: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 'inherit',
  },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
    margin: '10px 0',
    fontSize: '13px',
  },
  th: {
    border: '1px solid #cbd5e1',
    padding: '6px 8px',
    background: '#f1f5f9',
    textAlign: 'left',
  },
  td: {
    border: '1px solid #cbd5e1',
    padding: '6px 8px',
  },
};

function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeSanitize, rehypeKatex]}
      components={markdownComponents}
    >
      {normalizeMathBlocks(text)}
    </ReactMarkdown>
  );
}

function normalizeMathBlocks(text: string): string {
  return text.replace(/^\s*\$\$(.+?)\$\$\s*$/gm, (_, formula: string) => `$$\n${formula.trim()}\n$$`);
}

function TypingDots({ color = '#64748b' }: { color?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }} aria-label="typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: color,
            animation: 'blink 1s infinite',
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
    </span>
  );
}

function MentorBubble({ bubble, mentor }: { bubble: BubbleState; mentor: MentorInfo | undefined }) {
  const color = bubble.color || mentor?.color || '#555';
  const name = bubble.name || mentor?.name || bubble.mentorId;

  return (
    <div style={{
      borderLeft: `4px solid ${color}`,
      paddingLeft: '12px',
      marginBottom: '16px',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '6px',
      }}>
        <span style={{
          fontSize: '12px',
          fontWeight: 700,
          color: color,
          letterSpacing: '0.03em',
        }}>
          {name}
        </span>
        {bubble.streaming && (
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            opacity: 0.8,
            animation: 'blink 1s infinite',
          }} />
        )}
      </div>
      <div style={{
        color: '#374151',
        fontSize: '14px',
        lineHeight: '1.6',
        wordBreak: 'break-word',
      }}>
        {bubble.text ? <MarkdownContent text={bubble.text} /> : (bubble.streaming ? <TypingDots color={color} /> : null)}
      </div>
    </div>
  );
}

function SynthesisBubble({ bubble }: { bubble: BubbleState }) {
  return (
    <div style={{
      borderLeft: '4px solid #d97706',
      paddingLeft: '12px',
      marginBottom: '16px',
      background: '#fffbeb',
      padding: '12px',
      borderRadius: '0 8px 8px 0',
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 700,
        color: '#d97706',
        marginBottom: '6px',
      }}>
        Synthesis
        {bubble.streaming && (
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#d97706',
            marginLeft: '8px',
            animation: 'blink 1s infinite',
          }} />
        )}
      </div>
      <div style={{
        color: '#1e293b',
        fontSize: '14px',
        lineHeight: '1.6',
        wordBreak: 'break-word',
      }}>
        {bubble.text ? <MarkdownContent text={bubble.text} /> : (bubble.streaming ? <TypingDots color="#d97706" /> : null)}
      </div>
    </div>
  );
}

function PhaseBadge({ name }: { name: string }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      background: '#f3f4f6',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      fontSize: '11px',
      color: '#6b7280',
      marginBottom: '12px',
    }}>
      <span style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#7c3aed',
      }} />
      Phase: {name}
    </div>
  );
}

function ReportBubble({ markdown }: { markdown: string }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '16px',
      background: '#faf5ff',
      marginBottom: '16px',
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 700,
        color: '#7c3aed',
        marginBottom: '10px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        Deep Review Report
      </div>
      <div style={{
        color: '#374151',
        fontSize: '13px',
        lineHeight: '1.7',
        wordBreak: 'break-word',
      }}>
        <MarkdownContent text={markdown} />
      </div>
    </div>
  );
}

function ThinkingStatus({ status, detail }: { status: ChatRunStatus; detail?: string | null }) {
  const labels: Record<ChatRunStatus, string> = {
    idle: '',
    routing: '正在思考',
    streaming: '导师正在发言...',
    synthesizing: '正在整合结论...',
    reviewing: '正在进行深度评审...',
  };
  const defaultDetails: Record<ChatRunStatus, string> = {
    idle: '',
    routing: '主持人正在理解问题',
    streaming: '多位导师并行生成观点',
    synthesizing: '主持人整合共识、分歧与下一步',
    reviewing: '按阶段生成评审报告',
  };
  if (status === 'idle') return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-chat-item="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        maxWidth: '80%',
        padding: '8px 12px',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '999px',
        color: '#1e3a8a',
        fontSize: '13px',
        marginBottom: '16px',
        alignSelf: 'flex-start',
        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)',
      }}
    >
      <TypingDots />
      <strong style={{ whiteSpace: 'nowrap' }}>{labels[status]}</strong>
      <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {detail || defaultDetails[status]}
      </span>
    </div>
  );
}

function RouteInfo({ speakers, reason }: { speakers: string[]; reason?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      marginBottom: '16px',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '11px', color: '#6b7280' }}>Routing to:</span>
      {speakers.map((s) => (
        <span key={s} style={{
          padding: '2px 8px',
          background: '#e0e7ff',
          color: '#4338ca',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
        }}>
          {s}
        </span>
      ))}
      {reason && (
        <span style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic' }}>{reason}</span>
      )}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-end',
      marginBottom: '16px',
    }} data-chat-item="user">
      <div style={{
        maxWidth: '70%',
        background: '#2563eb',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: '12px 12px 2px 12px',
        fontSize: '14px',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {text}
      </div>
    </div>
  );
}

export function ChatStream({ bubbles, mentorsById, status = 'idle', progressDetail = null }: ChatStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bubbles]);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {bubbles.length === 0 && status === 'idle' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          gap: '8px',
        }}>
          <div style={{ fontSize: '32px' }}>🧠</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#374151' }}>SuperBrain</div>
          <div style={{ fontSize: '13px' }}>Ask your mentor committee anything</div>
          <div style={{ fontSize: '12px', marginTop: '8px' }}>
            Use <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', color: '#7c3aed' }}>/review &lt;idea&gt;</code> for deep analysis
          </div>
        </div>
      )}

      {bubbles.map((bubble, i) => {
        switch (bubble.kind) {
          case 'user':
            return <UserBubble key={i} text={bubble.text} />;
          case 'route':
            return (
              <RouteInfo
                key={i}
                speakers={(bubble as BubbleState & { kind: 'route'; speakers: string[]; reason?: string }).speakers}
                reason={(bubble as BubbleState & { kind: 'route'; reason?: string }).reason}
              />
            );
          case 'phase':
            return <PhaseBadge key={i} name={bubble.name || ''} />;
          case 'report':
            return <ReportBubble key={i} markdown={bubble.text} />;
          case 'synthesis':
            return <SynthesisBubble key={i} bubble={bubble} />;
          case 'mentor':
            return (
              <MentorBubble
                key={bubble.mentorId + '_' + i}
                bubble={bubble}
                mentor={mentorsById.get(bubble.mentorId)}
              />
            );
          default:
            return null;
        }
      })}

      <ThinkingStatus status={status} detail={progressDetail} />

      <div ref={bottomRef} />
    </div>
  );
}
