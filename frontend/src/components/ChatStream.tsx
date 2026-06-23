import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { BubbleState, MentorInfo, RouteSpeaker } from '../bubbles';
import type { StageState } from '../App';
import { extractCaseFromText, type RepresentativeCase } from '../insights';

export type ChatRunStatus = 'idle' | 'routing' | 'streaming' | 'synthesizing' | 'reviewing';

interface ChatStreamProps {
  bubbles: BubbleState[];
  mentorsById: Map<string, MentorInfo>;
  status?: ChatRunStatus;
  progressDetail?: string | null;
  statusSteps?: string[];
  stageState?: StageState | null;
  representativeCase?: RepresentativeCase | null;
  availableCases?: RepresentativeCase[];
  onCaseAction?: ((action: 'probe' | 'compare' | 'experiment', caseText: string, compareTarget?: string) => void) | null;
  onForkMessage?: ((messageId: string, preview: string) => void) | null;
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

function CaseActionRow({
  caseId,
  caseText,
  availableCases = [],
  onAction,
  compact = false,
}: {
  caseId?: string;
  caseText: string;
  availableCases?: RepresentativeCase[];
  onAction?: ((action: 'probe' | 'compare' | 'experiment', caseText: string, compareTarget?: string) => void) | null;
  compact?: boolean;
}) {
  const [showCompareOptions, setShowCompareOptions] = useState(false);
  const alternativeCases = availableCases.filter((candidate) => (
    candidate.status === 'confirmed'
    && candidate.id !== caseId
    && candidate.text !== caseText
  ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '6px' : '8px', marginTop: compact ? '8px' : 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '6px' : '8px' }}>
        <button
          onClick={() => onAction?.('probe', caseText)}
          style={{
            padding: compact ? '5px 8px' : '6px 10px',
            borderRadius: '999px',
            border: '1px solid #fdba74',
            background: '#fff',
            color: '#9a3412',
            fontSize: compact ? '10px' : '11px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          围绕这个 case 深挖
        </button>
        <button
          onClick={() => setShowCompareOptions((prev) => !prev)}
          style={{
            padding: compact ? '5px 8px' : '6px 10px',
            borderRadius: '999px',
            border: '1px solid #fdba74',
            background: showCompareOptions ? '#fff7ed' : '#fff',
            color: '#9a3412',
            fontSize: compact ? '10px' : '11px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          对比另一个 case
        </button>
        <button
          onClick={() => onAction?.('experiment', caseText)}
          style={{
            padding: compact ? '5px 8px' : '6px 10px',
            borderRadius: '999px',
            border: '1px solid #fdba74',
            background: '#fff',
            color: '#9a3412',
            fontSize: compact ? '10px' : '11px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          转成实验问题
        </button>
      </div>
      {showCompareOptions && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          padding: compact ? '8px' : '10px',
          borderRadius: '10px',
          border: '1px solid #fed7aa',
          background: '#fffaf5',
        }}>
          <div style={{ fontSize: compact ? '10px' : '11px', fontWeight: 700, color: '#9a3412' }}>
            选择要对比的 case
          </div>
          {alternativeCases.length === 0 ? (
            <div style={{ fontSize: compact ? '10px' : '11px', color: '#b45309', lineHeight: 1.45 }}>
              当前会话里还没有可选的其他 case。
            </div>
          ) : (
            alternativeCases.slice(0, 6).map((candidate) => (
              <button
                key={candidate.id}
                onClick={() => {
                  onAction?.('compare', caseText, candidate.text);
                  setShowCompareOptions(false);
                }}
                style={{
                  textAlign: 'left',
                  padding: compact ? '7px 8px' : '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #fdba74',
                  background: '#ffffff',
                  color: '#7c2d12',
                  fontSize: compact ? '10px' : '11px',
                  lineHeight: 1.5,
                  cursor: 'pointer',
                }}
              >
                <strong>{candidate.source}</strong>
                <div>{truncateCase(candidate.text, compact ? 72 : 96)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MentorBubble({
  bubble,
  mentor,
  onCaseAction,
  availableCases,
}: {
  bubble: BubbleState;
  mentor: MentorInfo | undefined;
  onCaseAction?: ((action: 'probe' | 'compare' | 'experiment', caseText: string, compareTarget?: string) => void) | null;
  availableCases?: RepresentativeCase[];
}) {
  const color = bubble.color || mentor?.color || '#555';
  const name = bubble.name || mentor?.name || bubble.mentorId;
  const inlineCase = bubble.text ? extractCaseFromText(bubble.text, name, color, 'mentor') : null;

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
      {inlineCase?.status === 'confirmed' && (
        <CaseActionRow
          caseId={inlineCase.id}
          caseText={inlineCase.text}
          availableCases={availableCases}
          onAction={onCaseAction}
          compact
        />
      )}
    </div>
  );
}

function SynthesisBubble({
  bubble,
}: {
  bubble: BubbleState;
}) {
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
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span>主持人</span>
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

function ReportBubble({
  markdown,
  onCaseAction,
  availableCases,
}: {
  markdown: string;
  onCaseAction?: ((action: 'probe' | 'compare' | 'experiment', caseText: string, compareTarget?: string) => void) | null;
  availableCases?: RepresentativeCase[];
}) {
  const inlineCase = extractCaseFromText(markdown, 'Deep Review', '#7c3aed', 'report');
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
      {inlineCase?.status === 'confirmed' && (
        <CaseActionRow
          caseId={inlineCase.id}
          caseText={inlineCase.text}
          availableCases={availableCases}
          onAction={onCaseAction}
          compact
        />
      )}
    </div>
  );
}

function RouteInfo({ speakers, reason }: { speakers: RouteSpeaker[]; reason?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '12px',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      marginBottom: '16px',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Panel Routing
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {speakers.map((speaker) => (
          <div
            key={speaker.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              minWidth: '140px',
              maxWidth: '220px',
              padding: '8px 10px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 700, color: speaker.color || '#4338ca' }}>
              {speaker.name}
            </span>
            {speaker.directive && (
              <span style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.45 }}>
                {speaker.directive}
              </span>
            )}
          </div>
        ))}
      </div>
      {reason && (
        <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
          {reason}
        </div>
      )}
    </div>
  );
}

function AnswerGroupFork({
  target,
  onForkMessage,
}: {
  target: { messageId: string; preview: string };
  onForkMessage?: ((messageId: string, preview: string) => void) | null;
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-start',
      marginTop: '-8px',
      marginBottom: '18px',
      paddingLeft: '12px',
    }}>
      <button
        aria-label="Fork answer"
        title="Fork answer"
        onClick={() => onForkMessage?.(target.messageId, target.preview)}
        style={forkButtonStyle}
      >
        Fork
      </button>
    </div>
  );
}

function UserBubble({
  text,
}: {
  text: string;
}) {
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

function ProblemFraming({ stageState }: { stageState: StageState }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      marginBottom: '16px',
      padding: '12px 14px',
      border: '1px solid #e2e8f0',
      background: '#fcfcfd',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Problem Framing
        </span>
        <span style={{
          padding: '3px 8px',
          borderRadius: '999px',
          background: '#eef2ff',
          border: '1px solid #c7d2fe',
          color: '#4338ca',
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'capitalize',
        }}>
          {stageState.stage}
        </span>
      </div>
      <div style={{ fontSize: '13px', color: '#1e293b', lineHeight: 1.55 }}>
        {stageState.framing}
      </div>
      {stageState.why && (
        <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
          {stageState.why}
        </div>
      )}
    </div>
  );
}

function CaseSpotlight({
  representativeCase,
  expanded,
  onToggle,
  onAction,
  availableCases,
}: {
  representativeCase: RepresentativeCase;
  expanded: boolean;
  onToggle: () => void;
  onAction?: ((action: 'probe' | 'compare' | 'experiment', caseText: string, compareTarget?: string) => void) | null;
  availableCases?: RepresentativeCase[];
}) {
  const previewText = representativeCase.text.length > 120
    ? `${representativeCase.text.slice(0, 120).trim()}...`
    : representativeCase.text;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      marginBottom: '16px',
      padding: '14px 16px',
      border: '1px solid #fed7aa',
      background: '#fff7ed',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(194, 65, 12, 0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#c2410c',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          Representative Case
        </span>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: representativeCase.color,
          flex: '0 0 auto',
        }} />
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#7c2d12' }}>
          {representativeCase.source}
        </span>
        <span style={{
          padding: '2px 6px',
          borderRadius: '999px',
          background: representativeCase.signal === 'expand' ? '#ffedd5' : '#fff',
          border: '1px solid #fdba74',
          color: '#c2410c',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}>
          {representativeCase.signal === 'expand' ? 'Expand This' : 'Case Anchor'}
        </span>
        <button
          onClick={onToggle}
          style={{
            marginLeft: 'auto',
            padding: '4px 8px',
            borderRadius: '999px',
            border: '1px solid #fdba74',
            background: '#fff',
            color: '#c2410c',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {expanded ? '收起案例' : '展开案例'}
        </button>
      </div>
      <div style={{ fontSize: '14px', color: '#7c2d12', lineHeight: 1.6 }}>
        <MarkdownContent text={expanded ? representativeCase.text : previewText} />
      </div>
      {expanded && (
        <div style={{ fontSize: '12px', color: '#9a3412', lineHeight: 1.45 }}>
          {representativeCase.rationale}
        </div>
      )}
      <CaseActionRow caseId={representativeCase.id} caseText={representativeCase.text} availableCases={availableCases} onAction={onAction} />
    </div>
  );
}

function progressColor(status: ChatRunStatus): string {
  switch (status) {
    case 'routing':
      return '#2563eb';
    case 'streaming':
      return '#0891b2';
    case 'synthesizing':
      return '#d97706';
    case 'reviewing':
      return '#7c3aed';
    default:
      return '#94a3b8';
  }
}

function progressTint(status: ChatRunStatus): string {
  switch (status) {
    case 'routing':
      return 'rgba(37, 99, 235, 0.14)';
    case 'streaming':
      return 'rgba(8, 145, 178, 0.14)';
    case 'synthesizing':
      return 'rgba(217, 119, 6, 0.16)';
    case 'reviewing':
      return 'rgba(124, 58, 237, 0.14)';
    default:
      return 'rgba(148, 163, 184, 0.12)';
  }
}

function ThinkingStatus({
  status,
  detail,
  statusSteps = [],
}: {
  status: ChatRunStatus;
  detail?: string | null;
  statusSteps?: string[];
}) {
  const labels: Record<ChatRunStatus, string> = {
    idle: '',
    routing: '正在思考',
    streaming: '专家正在发言',
    synthesizing: '正在整合结论',
    reviewing: '正在进行深度评审',
  };
  const defaultDetails: Record<ChatRunStatus, string> = {
    idle: '',
    routing: '主持人正在理解问题并选择专家视角',
    streaming: '多位专家并行生成观点',
    synthesizing: '主持人整合共识、分歧与下一步',
    reviewing: '按阶段生成评审报告',
  };
  const stages: Array<{ key: ChatRunStatus; label: string }> = [
    { key: 'routing', label: 'Route' },
    { key: 'streaming', label: 'Debate' },
    { key: 'synthesizing', label: 'Moderator' },
    { key: 'reviewing', label: 'Review' },
  ];

  if (status === 'idle') return null;

  const stepRows = buildStatusRows(status, statusSteps, detail);

  return (
    <div
      role="status"
      aria-live="polite"
      data-chat-item="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '100%',
        padding: '12px 14px',
        background: 'linear-gradient(180deg, #f8fbff 0%, #eff6ff 100%)',
        border: '1px solid #bfdbfe',
        borderRadius: '14px',
        color: '#1e3a8a',
        marginBottom: '16px',
        alignSelf: 'flex-start',
        boxShadow: '0 6px 18px rgba(37, 99, 235, 0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: progressColor(status),
            boxShadow: `0 0 0 4px ${progressTint(status)}`,
            flex: '0 0 auto',
          }}
        />
        <strong style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>{labels[status]}</strong>
        <TypingDots color={progressColor(status)} />
      </div>
      <div style={{ color: '#334155', fontSize: '13px', lineHeight: 1.5 }}>
        {detail || defaultDetails[status]}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {stages.map((stage) => {
          const active = stage.key === status;
          return (
            <span
              key={stage.key}
              style={{
                padding: '4px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.02em',
                background: active ? progressTint(stage.key) : '#ffffff',
                color: active ? progressColor(stage.key) : '#64748b',
                border: `1px solid ${active ? progressColor(stage.key) : '#dbeafe'}`,
              }}
            >
              {stage.label}
            </span>
          );
        })}
      </div>
      {stepRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {stepRows.map((row, index) => (
            <div key={`${row.label}_${index}`} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span
                style={{
                  width: '16px',
                  flex: '0 0 16px',
                  color: row.state === 'done' ? '#16a34a' : row.state === 'active' ? progressColor(status) : '#94a3b8',
                  fontSize: '12px',
                  lineHeight: 1.4,
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                {row.state === 'done' ? '✓' : row.state === 'active' ? '•' : '○'}
              </span>
              <div style={{
                fontSize: '12px',
                lineHeight: 1.45,
                color: row.state === 'pending' ? '#64748b' : '#334155',
                fontWeight: row.state === 'active' ? 700 : 500,
              }}>
                {row.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildStatusRows(status: ChatRunStatus, steps: string[], detail: string | null | undefined) {
  if (status === 'routing') {
    const invite = steps.find((step) => step.startsWith('已邀请')) || '邀请合适专家发言';
    return buildCanonicalRows(
      [
        '读取长期记忆',
        '判断当前思考阶段',
        '分析问题并编排导师',
        invite,
      ],
      steps,
      detail,
    );
  }

  if (status === 'streaming') {
    return buildCanonicalRows(
      [
        '等待专家开始发言',
        '多位专家并行生成观点',
      ],
      steps,
      detail || '多位专家并行生成观点',
    );
  }

  if (status === 'synthesizing') {
    return buildCanonicalRows(
      [
        '主持人整理关键观点',
        detail || '主持人输出本轮总结',
      ],
      steps.length > 0 ? steps : ['主持人正在汇总结论'],
      detail || '主持人输出本轮总结',
    );
  }

  if (status === 'reviewing') {
    const labels = steps.length > 0 ? steps : [detail || '准备深度评审'];
    return labels.map((label, index) => ({
      label,
      state: index === labels.length - 1 ? 'active' : 'done',
    }));
  }

  return [];
}

function buildCanonicalRows(
  canonical: string[],
  seenSteps: string[],
  activeDetail: string | null | undefined,
) {
  const rows = canonical.map((label) => {
    const matched = seenSteps.some((step) => matchesStep(label, step));
    return {
      label,
      state: matched ? 'done' : 'pending',
    };
  });

  const activeIndex = rows.findIndex((row) => matchesStep(row.label, activeDetail || ''));
  if (activeIndex >= 0) {
    rows[activeIndex] = { ...rows[activeIndex], state: 'active' };
    for (let i = 0; i < activeIndex; i += 1) rows[i] = { ...rows[i], state: 'done' };
  } else {
    const firstPending = rows.findIndex((row) => row.state === 'pending');
    if (firstPending >= 0) rows[firstPending] = { ...rows[firstPending], state: 'active' };
  }

  return rows;
}

function matchesStep(label: string, detail: string) {
  if (!detail) return false;
  if (label === '邀请合适专家发言') return detail.startsWith('已邀请');
  if (label === '等待专家开始发言') return detail.includes('等待导师开始发言') || detail.includes('等待专家开始发言');
  if (label === '多位专家并行生成观点') return detail.includes('并行生成观点') || detail.includes('专家正在发言');
  if (label === '主持人整理关键观点') return detail.includes('汇总结论') || detail.includes('整理关键观点');
  if (label === '分析问题并编排导师') return detail.includes('分析问题并编排导师');
  return detail.includes(label);
}

export function ChatStream({
  bubbles,
  mentorsById,
  status = 'idle',
  progressDetail = null,
  statusSteps = [],
  stageState = null,
  representativeCase = null,
  availableCases = [],
  onCaseAction = null,
  onForkMessage = null,
}: ChatStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [caseExpanded, setCaseExpanded] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bubbles, status, progressDetail]);

  useEffect(() => {
    setCaseExpanded(false);
  }, [representativeCase?.id]);

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
          <div style={{ fontSize: '13px' }}>Brainstorm AI ideas with broad and specialist expert perspectives</div>
          <div style={{ fontSize: '12px', marginTop: '8px' }}>
            Use <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', color: '#7c3aed' }}>/review &lt;idea&gt;</code> for deep analysis
          </div>
        </div>
      )}

      {stageState && status !== 'idle' && <ProblemFraming stageState={stageState} />}
      {representativeCase && (
        <CaseSpotlight
          representativeCase={representativeCase}
          expanded={caseExpanded}
          onToggle={() => setCaseExpanded((prev) => !prev)}
          onAction={onCaseAction}
          availableCases={availableCases}
        />
      )}

      {bubbles.map((bubble, i) => {
        const forkTarget = getAnswerGroupForkTarget(bubbles, i);
        const rendered = (() => {
        switch (bubble.kind) {
          case 'user':
            return <UserBubble text={bubble.text} />;
          case 'route':
            return (
              <RouteInfo
                speakers={(bubble as BubbleState & { kind: 'route'; speakers: RouteSpeaker[]; reason?: string }).speakers}
                reason={(bubble as BubbleState & { kind: 'route'; reason?: string }).reason}
              />
            );
          case 'phase':
            return <PhaseBadge name={bubble.name || ''} />;
          case 'report':
            return (
              <ReportBubble
                markdown={bubble.text}
                onCaseAction={onCaseAction}
                availableCases={availableCases}
              />
            );
          case 'synthesis':
            return <SynthesisBubble bubble={bubble} />;
          case 'mentor':
            return (
              <MentorBubble
                bubble={bubble}
                mentor={mentorsById.get(bubble.mentorId)}
                onCaseAction={onCaseAction}
                availableCases={availableCases}
              />
            );
          default:
            return null;
        }
        })();

        return (
          <div key={bubble.id || `${bubble.kind}_${i}`}>
            {rendered}
            {forkTarget && (
              <AnswerGroupFork target={forkTarget} onForkMessage={onForkMessage} />
            )}
          </div>
        );
      })}

      <ThinkingStatus status={status} detail={progressDetail} statusSteps={statusSteps} />

      <div ref={bottomRef} />
    </div>
  );
}

function truncateCase(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function getAnswerGroupForkTarget(
  bubbles: BubbleState[],
  index: number,
): { messageId: string; preview: string } | null {
  if (bubbles[index]?.kind === 'user') return null;
  if (index < bubbles.length - 1 && bubbles[index + 1]?.kind !== 'user') return null;

  for (let i = index; i >= 0 && bubbles[i]?.kind !== 'user'; i -= 1) {
    const bubble = bubbles[i];
    if (!isAnswerBubble(bubble)) continue;
    if (!bubble.id || !isPersistedBubbleId(bubble.id) || isStreamingAnswerBubble(bubble)) continue;
    const preview = bubble.text.trim();
    if (preview) return { messageId: bubble.id, preview };
  }

  return null;
}

function isAnswerBubble(bubble: BubbleState): bubble is Extract<BubbleState, { kind: 'mentor' | 'synthesis' | 'report' }> {
  return bubble.kind === 'mentor' || bubble.kind === 'synthesis' || bubble.kind === 'report';
}

function isStreamingAnswerBubble(bubble: Extract<BubbleState, { kind: 'mentor' | 'synthesis' | 'report' }>) {
  return (bubble.kind === 'mentor' || bubble.kind === 'synthesis') && bubble.streaming;
}

function isPersistedBubbleId(id: string) {
  return !id.includes('_');
}

const forkButtonStyle: CSSProperties = {
  padding: '3px 9px',
  borderRadius: '999px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#64748b',
  fontSize: '10px',
  fontWeight: 700,
  cursor: 'pointer',
  lineHeight: 1.4,
};
