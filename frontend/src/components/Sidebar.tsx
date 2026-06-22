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
      borderRight: '1px solid #e5e7eb',
      display: 'flex',
      flexDirection: 'column',
      background: '#f9fafb',
      overflowY: 'auto',
    }}>
      <div style={{
        padding: '16px 12px 8px',
        fontWeight: 700,
        fontSize: '15px',
        color: '#1e293b',
        letterSpacing: '0.02em',
        borderBottom: '1px solid #e5e7eb',
      }}>
        SuperBrain
      </div>

      <button
        onClick={onNew}
        style={{
          margin: '10px 10px 4px',
          padding: '8px 12px',
          background: '#2563eb',
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
          <p style={{ color: '#9ca3af', fontSize: '12px', padding: '8px 12px' }}>
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
              background: c.id === activeId ? '#e0e7ff' : 'transparent',
              color: c.id === activeId ? '#1e293b' : '#64748b',
              border: 'none',
              borderLeft: c.id === activeId ? '3px solid #2563eb' : '3px solid transparent',
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
