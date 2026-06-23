import type { ChatRunStatus } from './ChatStream';

const statusCopy: Record<ChatRunStatus, { title: string; detail: string }> = {
  idle: { title: '', detail: '' },
  routing: { title: '正在思考', detail: '理解问题并编排专家视角' },
  streaming: { title: '专家正在发言', detail: '多位专家并行生成观点' },
  synthesizing: { title: '正在汇总结论', detail: '主持人整合共识、分歧与下一步' },
  reviewing: { title: '正在深度评审', detail: '按阶段生成评审报告' },
};

export function ChatProgress({ status, detail }: { status: ChatRunStatus; detail?: string | null }) {
  if (status === 'idle') return null;
  const copy = statusCopy[status];
  const visibleDetail = detail || copy.detail;

  return (
    <div style={{
      flex: '0 0 auto',
      padding: '8px 16px 0',
      minHeight: '32px',
    }}>
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          maxWidth: '100%',
          padding: '7px 11px',
          background: '#eff6ff',
          color: '#1e3a8a',
          border: '1px solid #bfdbfe',
          borderRadius: '999px',
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)',
          fontSize: '12px',
          lineHeight: 1.2,
        }}
      >
        <span style={{
          flex: '0 0 auto',
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: '#2563eb',
          boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)',
          animation: 'pulse 1s infinite',
        }} />
        <strong style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{copy.title}</strong>
        <span style={{ color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {visibleDetail}
        </span>
      </div>
    </div>
  );
}
