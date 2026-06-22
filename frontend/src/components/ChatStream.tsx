import { useEffect, useRef } from 'react';
import type { BubbleState, MentorInfo } from '../App';

interface ChatStreamProps {
  bubbles: BubbleState[];
  mentorsById: Map<string, MentorInfo>;
}

function MentorBubble({ bubble, mentor }: { bubble: BubbleState; mentor: MentorInfo | undefined }) {
  const color = bubble.color || mentor?.color || '#555';
  const name = bubble.name || mentor?.name || bubble.mentorId;

  return (
    <div style={{
      borderLeft: `4px solid ${color}`,
      paddingLeft: '12px',
      marginBottom: '16px',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '6px',
      }}>
        <span style={{
          fontSize: '12px',
          fontWeight: 700,
          color: color,
          letterSpacing: '0.03em',
        }}>
          {name}
        </span>
        {bubble.streaming && (
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            opacity: 0.8,
            animation: 'blink 1s infinite',
          }} />
        )}
      </div>
      <div style={{
        color: '#374151',
        fontSize: '14px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {bubble.text || (bubble.streaming ? ' ' : '')}
      </div>
    </div>
  );
}

function SynthesisBubble({ bubble }: { bubble: BubbleState }) {
  return (
    <div style={{
      borderLeft: '4px solid #d97706',
      paddingLeft: '12px',
      marginBottom: '16px',
      background: '#fffbeb',
      padding: '12px',
      borderRadius: '0 8px 8px 0',
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 700,
        color: '#d97706',
        marginBottom: '6px',
      }}>
        Synthesis
        {bubble.streaming && (
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#d97706',
            marginLeft: '8px',
            animation: 'blink 1s infinite',
          }} />
        )}
      </div>
      <div style={{
        color: '#1e293b',
        fontSize: '14px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {bubble.text}
      </div>
    </div>
  );
}

function PhaseBadge({ name }: { name: string }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      background: '#f3f4f6',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      fontSize: '11px',
      color: '#6b7280',
      marginBottom: '12px',
    }}>
      <span style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#7c3aed',
      }} />
      Phase: {name}
    </div>
  );
}

function ReportBubble({ markdown }: { markdown: string }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '16px',
      background: '#faf5ff',
      marginBottom: '16px',
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 700,
        color: '#7c3aed',
        marginBottom: '10px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        Deep Review Report
      </div>
      <div style={{
        color: '#374151',
        fontSize: '13px',
        lineHeight: '1.7',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'monospace',
      }}>
        {markdown}
      </div>
    </div>
  );
}

function RouteInfo({ speakers, reason }: { speakers: string[]; reason?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      marginBottom: '16px',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '11px', color: '#6b7280' }}>Routing to:</span>
      {speakers.map((s) => (
        <span key={s} style={{
          padding: '2px 8px',
          background: '#e0e7ff',
          color: '#4338ca',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
        }}>
          {s}
        </span>
      ))}
      {reason && (
        <span style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic' }}>{reason}</span>
      )}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-end',
      marginBottom: '16px',
    }}>
      <div style={{
        maxWidth: '70%',
        background: '#2563eb',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: '12px 12px 2px 12px',
        fontSize: '14px',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {text}
      </div>
    </div>
  );
}

export function ChatStream({ bubbles, mentorsById }: ChatStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bubbles]);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {bubbles.length === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          gap: '8px',
        }}>
          <div style={{ fontSize: '32px' }}>🧠</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#374151' }}>SuperBrain</div>
          <div style={{ fontSize: '13px' }}>Ask your mentor committee anything</div>
          <div style={{ fontSize: '12px', marginTop: '8px' }}>
            Use <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', color: '#7c3aed' }}>/review &lt;idea&gt;</code> for deep analysis
          </div>
        </div>
      )}

      {bubbles.map((bubble, i) => {
        switch (bubble.kind) {
          case 'user':
            return <UserBubble key={i} text={bubble.text} />;
          case 'route':
            return (
              <RouteInfo
                key={i}
                speakers={(bubble as BubbleState & { kind: 'route'; speakers: string[]; reason?: string }).speakers}
                reason={(bubble as BubbleState & { kind: 'route'; reason?: string }).reason}
              />
            );
          case 'phase':
            return <PhaseBadge key={i} name={bubble.name || ''} />;
          case 'report':
            return <ReportBubble key={i} markdown={bubble.text} />;
          case 'synthesis':
            return <SynthesisBubble key={i} bubble={bubble} />;
          case 'mentor':
            return (
              <MentorBubble
                key={bubble.mentorId + '_' + i}
                bubble={bubble}
                mentor={mentorsById.get(bubble.mentorId)}
              />
            );
          default:
            return null;
        }
      })}

      <div ref={bottomRef} />
    </div>
  );
}
