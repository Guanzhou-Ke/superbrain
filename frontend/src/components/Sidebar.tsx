import type { Conversation } from '../api';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({ conversations, activeId, onSelect, onNew }: SidebarProps) {
  return (
    <aside style={{
      width: '220px',
      minWidth: '180px',
      borderRight: '1px solid #2a2a2a',
      display: 'flex',
      flexDirection: 'column',
      background: '#111',
      overflowY: 'auto',
    }}>
      <div style={{
        padding: '16px 12px 8px',
        fontWeight: 700,
        fontSize: '15px',
        color: '#e2e8f0',
        letterSpacing: '0.02em',
        borderBottom: '1px solid #2a2a2a',
      }}>
        SuperBrain
      </div>

      <button
        onClick={onNew}
        style={{
          margin: '10px 10px 4px',
          padding: '8px 12px',
          background: '#1a56db',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 600,
          textAlign: 'left',
        }}
      >
        + New conversation
      </button>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {conversations.length === 0 && (
          <p style={{ color: '#555', fontSize: '12px', padding: '8px 12px' }}>
            No conversations yet
          </p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              background: c.id === activeId ? '#1e293b' : 'transparent',
              color: c.id === activeId ? '#e2e8f0' : '#94a3b8',
              border: 'none',
              borderLeft: c.id === activeId ? '3px solid #1a56db' : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '13px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {c.title}
          </button>
        ))}
      </div>
    </aside>
  );
}
