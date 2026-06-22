import type { Mentor } from '../api';

interface MentorRosterProps {
  mentors: Mentor[];
  activeSpeakers: Set<string>;
}

export function MentorRoster({ mentors, activeSpeakers }: MentorRosterProps) {
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
        Mentors
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {mentors.length === 0 && (
          <p style={{ color: '#9ca3af', fontSize: '12px', padding: '8px 12px' }}>
            No mentors loaded
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
              background: activeSpeakers.has(m.id) ? '#e0e7ff' : 'transparent',
              borderRadius: '0 4px 4px 0',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: activeSpeakers.has(m.id) ? '#1e293b' : '#64748b',
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
          onClick={() => alert('Add mentor via CLI:\nuv run superbrain mentor add "名字"')}
        >
          + Add mentor
        </button>
      </div>
    </aside>
  );
}
