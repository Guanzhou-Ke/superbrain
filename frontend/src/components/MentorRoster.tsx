import type { Mentor } from '../api';
import type { InsightItem } from '../insights';
import { MarkdownSnippet } from './MarkdownSnippet';
import type { ThinkingStage } from '../App';

interface MentorRosterProps {
  mentors: Mentor[];
  activeSpeakers: Set<string>;
  insights: InsightItem[];
  stage: ThinkingStage | null;
}

export function MentorRoster({ mentors, activeSpeakers, insights, stage }: MentorRosterProps) {
  const stageCopy = stagePanelCopy(stage);
  const expandingInsights = insights.filter((insight) => insight.signal === 'expand');
  const keptInsights = insights.filter((insight) => insight.signal === 'keep');
  const droppedCount = insights.reduce((sum, insight) => sum + insight.dropped, 0);

  return (
    <aside style={{
      width: '100%',
      height: '100%',
      borderLeft: '1px solid #e5e7eb',
      display: 'flex',
      flexDirection: 'column',
      background: '#f9fafb',
      overflowY: 'auto',
    }}>
      <div style={{
        padding: '16px 12px 8px',
        fontWeight: 700,
        fontSize: '13px',
        color: '#6b7280',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        borderBottom: '1px solid #e5e7eb',
      }}>
        Research Panel
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        <section style={{ padding: '0 12px 14px' }}>
          <div style={sectionTitleStyle}>Insights</div>
          <div style={{
            marginBottom: '12px',
            padding: '10px 12px',
            borderRadius: '10px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
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
                {stageCopy.badge}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                {stageCopy.title}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
              {stageCopy.detail}
            </div>
          </div>
          {insights.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '12px', lineHeight: 1.6 }}>
              High-signal takeaways from the panel will appear here while the discussion unfolds.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {expandingInsights.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                    Worth Expanding
                  </div>
                  {expandingInsights.map(renderInsightCard)}
                </div>
              )}
              {keptInsights.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                    Keep as Conclusion
                  </div>
                  {keptInsights.map(renderInsightCard)}
                </div>
              )}
              {droppedCount > 0 && (
                <div style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#94a3b8',
                  fontSize: '11px',
                  lineHeight: 1.4,
                }}>
                  已收敛 {droppedCount} 条低信号观点，避免让常识性或重复内容占据主视图。
                </div>
              )}
            </div>
          )}
        </section>

        <section style={{ padding: '0 0 8px' }}>
          <div style={{ ...sectionTitleStyle, padding: '0 12px' }}>Experts</div>
          {mentors.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: '12px', padding: '8px 12px' }}>
              No experts loaded
            </p>
          )}
          {mentors.map((m) => (
            <div
              key={m.id}
              style={{
                padding: '8px 12px',
                borderLeft: `3px solid ${m.color || '#9ca3af'}`,
                marginLeft: '8px',
                marginBottom: '6px',
                background: activeSpeakers.has(m.id) ? '#e0f2fe' : 'transparent',
                borderRadius: '0 4px 4px 0',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: activeSpeakers.has(m.id) ? '#0f172a' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                {activeSpeakers.has(m.id) && (
                  <span style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: m.color || '#9ca3af',
                    animation: 'pulse 1s infinite',
                  }} />
                )}
                {m.name}
              </div>
              {m.title && (
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                  {m.title}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>

      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid #e5e7eb',
      }}>
        <button
          style={{
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            color: '#6b7280',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
          onClick={() => alert('Add expert via CLI:\nuv run superbrain mentor add "名字"')}
        >
          + Add expert
        </button>
      </div>
    </aside>
  );
}

function renderInsightCard(insight: InsightItem) {
  return (
    <div
      key={insight.id}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        background: '#ffffff',
        padding: '10px 12px',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: insight.color,
            flex: '0 0 auto',
          }}
        />
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.03em' }}>
          {insight.source}
        </span>
        <span style={{
          padding: '2px 6px',
          borderRadius: '999px',
          background: insight.signal === 'expand' ? '#fff7ed' : '#f8fafc',
          border: `1px solid ${insight.signal === 'expand' ? '#fdba74' : '#e2e8f0'}`,
          color: insight.signal === 'expand' ? '#c2410c' : '#64748b',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}>
          {insight.category}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {insight.points.map((point, index) => (
          <div key={`${insight.id}_${index}`} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ color: insight.color, fontSize: '12px', lineHeight: 1.6 }}>•</span>
            <div style={{ fontSize: '13px', color: '#1e293b', lineHeight: 1.55 }}>
              <MarkdownSnippet text={point} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const sectionTitleStyle = {
  marginBottom: '10px',
  fontSize: '12px',
  fontWeight: 700,
  color: '#64748b',
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
};

function stagePanelCopy(stage: ThinkingStage | null): { badge: string; title: string; detail: string } {
  switch (stage) {
    case 'explore':
      return {
        badge: 'Explore',
        title: 'Opening the question space',
        detail: 'This round should privilege new angles, hidden assumptions, and promising directions over premature action items.',
      };
    case 'clarify':
      return {
        badge: 'Clarify',
        title: 'Comparing directions',
        detail: 'This round should surface tradeoffs, decision criteria, and the open questions that separate one path from another.',
      };
    case 'decide':
      return {
        badge: 'Decide',
        title: 'Forming a research judgment',
        detail: 'This round should highlight strong claims, major risks, and the evidence gaps that still block a confident call.',
      };
    case 'plan':
      return {
        badge: 'Plan',
        title: 'Turning judgment into action',
        detail: 'This round should focus on next experiments, validation strategy, and the execution risks behind the proposed plan.',
      };
    default:
      return {
        badge: 'Auto',
        title: 'Waiting for the panel to frame the problem',
        detail: 'The system will infer whether this discussion should open up, compare options, converge on a judgment, or move into planning.',
      };
  }
}
