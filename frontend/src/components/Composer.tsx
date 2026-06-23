import { useEffect, useState, useRef, type KeyboardEvent } from 'react';
import type { StageTransitionSuggestion } from '../App';

export type ChatMode = 'chat' | 'explore' | 'clarify' | 'decide' | 'plan' | 'review';

interface ComposerProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  onSend: (text: string, mode: ChatMode) => void;
  disabled: boolean;
  suggestion: StageTransitionSuggestion | null;
  draftText?: string | null;
}

export function Composer({ mode, onModeChange, onSend, disabled, suggestion, draftText = null }: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modes: Array<{ key: ChatMode; label: string; accent: string }> = [
    { key: 'chat', label: 'Auto', accent: '#2563eb' },
    { key: 'explore', label: 'Explore', accent: '#0f766e' },
    { key: 'clarify', label: 'Clarify', accent: '#0891b2' },
    { key: 'decide', label: 'Decide', accent: '#d97706' },
    { key: 'plan', label: 'Plan', accent: '#7c3aed' },
    { key: 'review', label: 'Review', accent: '#be185d' },
  ];

  const modeDescriptions: Record<ChatMode, string> = {
    chat: '让主持人自动判断当前该先发散、澄清、收敛还是规划。',
    explore: '打开问题空间，优先获取不同专家视角与可能方向。',
    clarify: '比较候选方向，帮助你形成判断标准和偏好。',
    decide: '收敛研究判断，明确共识、风险与待决问题。',
    plan: '在方向清楚后，再进入实验设计与下一步行动。',
    review: '对一个较完整的想法做系统性深度评审。',
  };

  useEffect(() => {
    if (!draftText) return;
    setText(draftText);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(draftText.length, draftText.length);
    });
  }, [draftText]);

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
      {suggestion && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '10px',
          padding: '10px 12px',
          borderRadius: '10px',
          border: '1px solid #dbeafe',
          background: '#f8fbff',
        }}>
          <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
            <strong style={{ color: '#1e3a8a' }}>Next step suggestion:</strong> {suggestion.reason}
          </div>
          <button
            onClick={() => onModeChange(suggestion.toStage)}
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '999px',
              border: '1px solid #93c5fd',
              background: '#ffffff',
              color: '#1d4ed8',
              cursor: 'pointer',
            }}
          >
            Switch to {labelForStage(suggestion.toStage)}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {modes.map((option) => (
            <button
              key={option.key}
              onClick={() => onModeChange(option.key)}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '999px',
                border: `1px solid ${mode === option.key ? option.accent : '#d1d5db'}`,
                cursor: 'pointer',
                background: mode === option.key ? option.accent : '#ffffff',
                color: mode === option.key ? '#fff' : '#64748b',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, maxWidth: '680px' }}>
            {modeDescriptions[mode]}
          </span>
          <span style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.5 }}>
            Tip: type /review &lt;idea&gt; to deep review
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            mode === 'review'
              ? 'Describe an AI idea, paper, or system to deep-review… (Enter to send)'
              : mode === 'explore'
                ? 'Describe a vague idea, curiosity, or direction you want to open up…'
                : mode === 'clarify'
                  ? 'Describe the directions, tradeoffs, or choices you want to compare…'
                  : mode === 'decide'
                    ? 'Describe the question you want the panel to help you judge…'
                    : mode === 'plan'
                      ? 'Describe the direction you are ready to turn into experiments or next steps…'
                      : 'Ask your research panel… (Enter to send, Shift+Enter for newline)'
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
            background: disabled || !text.trim()
              ? '#e5e7eb'
              : (modes.find((option) => option.key === mode)?.accent || '#2563eb'),
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

function labelForStage(mode: ChatMode): string {
  switch (mode) {
    case 'chat':
      return 'Auto';
    case 'explore':
      return 'Explore';
    case 'clarify':
      return 'Clarify';
    case 'decide':
      return 'Decide';
    case 'plan':
      return 'Plan';
    case 'review':
      return 'Review';
  }
}
