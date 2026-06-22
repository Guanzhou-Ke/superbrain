import { useState, useRef, type KeyboardEvent } from 'react';

export type ChatMode = 'chat' | 'review';

interface ComposerProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  onSend: (text: string, mode: ChatMode) => void;
  disabled: boolean;
}

export function Composer({ mode, onModeChange, onSend, disabled }: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // Support /review prefix to switch mode inline
    let finalMode = mode;
    let finalText = trimmed;

    if (trimmed.toLowerCase().startsWith('/review')) {
      finalMode = 'review';
      finalText = trimmed.slice('/review'.length).trim();
      if (!finalText) {
        onModeChange('review');
        setText('');
        return;
      }
    }

    onSend(finalText, finalMode);
    setText('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={{
      padding: '12px 16px',
      borderTop: '1px solid #e5e7eb',
      background: '#f9fafb',
    }}>
      {/* Mode selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <button
          onClick={() => onModeChange('chat')}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            background: mode === 'chat' ? '#2563eb' : '#e5e7eb',
            color: mode === 'chat' ? '#fff' : '#64748b',
          }}
        >
          Chat
        </button>
        <button
          onClick={() => onModeChange('review')}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            background: mode === 'review' ? '#7c3aed' : '#e5e7eb',
            color: mode === 'review' ? '#fff' : '#64748b',
          }}
        >
          Deep Review
        </button>
        <span style={{ fontSize: '11px', color: '#9ca3af', alignSelf: 'center', marginLeft: '4px' }}>
          Tip: type /review &lt;idea&gt; to deep review
        </span>
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            mode === 'review'
              ? 'Describe idea to deep-review… (Enter to send)'
              : 'Ask your mentors… (Enter to send, Shift+Enter for newline)'
          }
          rows={3}
          style={{
            flex: 1,
            background: '#ffffff',
            border: `1px solid ${mode === 'review' ? '#c4b5fd' : '#d1d5db'}`,
            borderRadius: '8px',
            color: '#1e293b',
            padding: '10px 12px',
            fontSize: '14px',
            resize: 'none',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          style={{
            padding: '10px 18px',
            background: disabled || !text.trim() ? '#e5e7eb' : (mode === 'review' ? '#7c3aed' : '#2563eb'),
            color: disabled || !text.trim() ? '#9ca3af' : '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            height: '44px',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
