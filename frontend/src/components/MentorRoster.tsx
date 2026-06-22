import type { Mentor } from '../api';

interface MentorRosterProps {
  mentors: Mentor[];
  activeSpeakers: Set<string>;
}

export function MentorRoster({ mentors, activeSpeakers }: MentorRosterProps) {
  return (
    <aside style={{
      width: '220px',
      minWidth: '180px',
      borderLeft: '1px solid #2a2a2a',
      display: 'flex',
      flexDirection: 'column',
      background: '#111',
      overflowY: 'auto',
    }}>
      <div style={{
        padding: '16px 12px 8px',
        fontWeight: 700,
        fontSize: '13px',
        color: '#94a3b8',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        borderBottom: '1px solid #2a2a2a',
      }}>
        Mentors
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {mentors.length === 0 && (
          <p style={{ color: '#555', fontSize: '12px', padding: '8px 12px' }}>
            No mentors loaded
          </p>
        )}
        {mentors.map((m) => (
          <div
            key={m.id}
            style={{
              padding: '8px 12px',
              borderLeft: `3px solid ${m.color || '#555'}`,
              marginLeft: '8px',
              marginBottom: '6px',
              background: activeSpeakers.has(m.id) ? '#1e2535' : 'transparent',
              borderRadius: '0 4px 4px 0',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: activeSpeakers.has(m.id) ? '#e2e8f0' : '#94a3b8',
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
                  background: m.color || '#555',
                  animation: 'pulse 1s infinite',
                }} />
              )}
              {m.name}
            </div>
            {m.title && (
              <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                {m.title}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid #2a2a2a',
      }}>
        <button
          style={{
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            color: '#555',
            border: '1px solid #2a2a2a',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
          onClick={() => alert('Add mentor via CLI:\nuv run superbrain add-mentor <url>')}
        >
          + Add mentor
        </button>
      </div>
    </aside>
  );
}
