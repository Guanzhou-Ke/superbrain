interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  return (
    <div style={{
      position: 'fixed',
      right: '20px',
      bottom: '88px',
      zIndex: 50,
      maxWidth: '360px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 12px',
      background: '#ecfdf5',
      color: '#065f46',
      border: '1px solid #a7f3d0',
      borderRadius: '10px',
      boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
      fontSize: '13px',
      lineHeight: 1.4,
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        aria-label="Dismiss notification"
        onClick={onDismiss}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#047857',
          cursor: 'pointer',
          fontSize: '16px',
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
