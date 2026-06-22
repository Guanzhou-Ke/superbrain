import type { Conversation } from '../api';
import type { ExportFormat } from '../api';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onExport: (id: string, format: ExportFormat) => void;
  actionsDisabled: boolean;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onExport,
  actionsDisabled,
}: SidebarProps) {
  return (
    <aside style={{
      width: '100%',
      height: '100%',
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
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              background: c.id === activeId ? '#e0e7ff' : 'transparent',
              borderLeft: c.id === activeId ? '3px solid #2563eb' : '3px solid transparent',
            }}
          >
            <button
              onClick={() => onSelect(c.id)}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'left',
                padding: '8px 6px 8px 9px',
                background: 'transparent',
                color: c.id === activeId ? '#1e293b' : '#64748b',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {c.title}
            </button>
            <button
              aria-label={`Export ${c.title} as Markdown`}
              disabled={actionsDisabled}
              onClick={() => onExport(c.id, 'md')}
              style={actionButtonStyle}
            >
              MD
            </button>
            <button
              aria-label={`Export ${c.title} as PDF`}
              disabled={actionsDisabled}
              onClick={() => onExport(c.id, 'pdf')}
              style={actionButtonStyle}
            >
              PDF
            </button>
            <button
              aria-label={`Delete ${c.title}`}
              disabled={actionsDisabled}
              onClick={() => onDelete(c.id)}
              style={{ ...actionButtonStyle, color: '#dc2626' }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

const actionButtonStyle = {
  flex: '0 0 auto',
  marginRight: '2px',
  padding: '3px 4px',
  background: 'transparent',
  color: '#64748b',
  border: '1px solid #e5e7eb',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '10px',
  lineHeight: 1,
};
