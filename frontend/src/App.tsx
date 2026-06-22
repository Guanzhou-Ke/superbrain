import { useState, useEffect, useCallback, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  listMentors,
  listConversations,
  createConversation,
  deleteConversation,
  exportConversation,
  getMessages,
  streamChat,
  type Mentor,
  type Conversation,
  type ExportFormat,
} from './api';
import { Sidebar } from './components/Sidebar';
import { ChatStream, type ChatRunStatus } from './components/ChatStream';
import { MentorRoster } from './components/MentorRoster';
import { Composer, type ChatMode } from './components/Composer';
import { Toast } from './components/Toast';
import { messagesAsBubbles, type BubbleState, type MentorInfo } from './bubbles';
import { clampPanelWidth, readStoredPanelWidth } from './panels';
import './App.css';

const LEFT_PANEL = { key: 'superbrain.leftPanelWidth', fallback: 220, min: 180, max: 420 };
const RIGHT_PANEL = { key: 'superbrain.rightPanelWidth', fallback: 220, min: 180, max: 480 };

function App() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [mentorsById, setMentorsById] = useState<Map<string, MentorInfo>>(new Map());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<BubbleState[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ChatMode>('chat');
  const [streaming, setStreaming] = useState(false);
  const [runStatus, setRunStatus] = useState<ChatRunStatus>('idle');
  const [progressDetail, setProgressDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(() => (
    readStoredPanelWidth(localStorage.getItem.bind(localStorage), LEFT_PANEL.key, LEFT_PANEL.fallback, LEFT_PANEL.min, LEFT_PANEL.max)
  ));
  const [rightWidth, setRightWidth] = useState(() => (
    readStoredPanelWidth(localStorage.getItem.bind(localStorage), RIGHT_PANEL.key, RIGHT_PANEL.fallback, RIGHT_PANEL.min, RIGHT_PANEL.max)
  ));
  const activeConvIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  useEffect(() => {
    localStorage.setItem(LEFT_PANEL.key, String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem(RIGHT_PANEL.key, String(rightWidth));
  }, [rightWidth]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleResizeStart = useCallback((
    side: 'left' | 'right',
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === 'left' ? leftWidth : rightWidth;
    const config = side === 'left' ? LEFT_PANEL : RIGHT_PANEL;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = side === 'left' ? startWidth + delta : startWidth - delta;
      const width = clampPanelWidth(next, config.min, config.max);
      if (side === 'left') {
        setLeftWidth(width);
      } else {
        setRightWidth(width);
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftWidth, rightWidth]);

  // Load mentors on mount
  useEffect(() => {
    listMentors()
      .then((ms) => {
        setMentors(ms);
        const map = new Map<string, MentorInfo>();
        for (const m of ms) map.set(m.id, { id: m.id, name: m.name, color: m.color });
        setMentorsById(map);
      })
      .catch(() => setError('Failed to load mentors'));
  }, []);

  // Load conversations on mount
  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch(() => setError('Failed to load conversations'));
  }, []);

  // Load messages when switching conversation
  useEffect(() => {
    if (!activeConvId) return;
    getMessages(activeConvId).then((msgs) => {
      setBubbles(messagesAsBubbles(msgs, mentorsById));
    }).catch(() => setError('Failed to load messages'));
  }, [activeConvId, mentorsById]);

  const handleNewConversation = useCallback(async () => {
    try {
      const { id } = await createConversation('新会话');
      const updated = await listConversations();
      setConversations(updated);
      setActiveConvId(id);
      setBubbles([]);
    } catch {
      setError('Failed to create conversation');
    }
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    if (streaming) return;
    setActiveConvId(id);
    setError(null);
  }, [streaming]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    if (streaming) return;
    const title = conversations.find((c) => c.id === id)?.title || 'this conversation';
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;

    try {
      await deleteConversation(id);
      const updated = await listConversations();
      setConversations(updated);
      if (activeConvIdRef.current === id) {
        const next = updated.find((c) => c.id !== id);
        setActiveConvId(next?.id ?? null);
        if (!next) setBubbles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  }, [conversations, streaming]);

  const handleExportConversation = useCallback(async (id: string, format: ExportFormat) => {
    try {
      const { blob, filename } = await exportConversation(id, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export conversation');
    }
  }, []);

  const handleSend = useCallback(async (text: string, sendMode: ChatMode) => {
    if (streaming) return;
    setError(null);
    setStreaming(true);
    setRunStatus(sendMode === 'review' ? 'reviewing' : 'routing');
    setProgressDetail(sendMode === 'review' ? '准备深度评审' : '准备理解问题');

    let convId = activeConvId;

    // Auto-create conversation if none selected
    if (!convId) {
      try {
        const title = text.slice(0, 60) + (text.length > 60 ? '…' : '');
        const { id } = await createConversation(title);
        convId = id;
        setActiveConvId(id);
        const updated = await listConversations();
        setConversations(updated);
      } catch {
        setError('Failed to create conversation');
        setStreaming(false);
        setRunStatus('idle');
        setProgressDetail(null);
        return;
      }
    }

    // Add user bubble immediately
    let localBubbleId = 0;
    const nextBubbleId = (prefix: string) => `${Date.now()}_${prefix}_${localBubbleId++}`;
    const userBubble: BubbleState = { id: nextBubbleId('user'), kind: 'user', text } as BubbleState;
    setBubbles((prev) => [...prev, userBubble]);

    // Track in-progress bubble IDs so removals do not desync token updates.
    const mentorBubbleIds = new Map<string, string>();
    let synthesisBubbleId: string | null = null;

    try {
      await streamChat(
        { conversation_id: convId, content: text, mode: sendMode },
        (event) => {
          switch (event.type) {
            case 'progress': {
              const status = event.status as ChatRunStatus | undefined;
              const message = event.message as string | undefined;
              if (status) setRunStatus(status);
              if (message) setProgressDetail(message);
              break;
            }

            case 'memory_saved': {
              const content = event.content as string | undefined;
              setToast(content ? `已保存到长期记忆：${content}` : '已保存到长期记忆');
              break;
            }

            case 'route': {
              const rawSpeakers = (event.speakers as Array<{mentor_id: string}>) || [];
              const speakers = rawSpeakers.map(s => typeof s === 'string' ? s : s.mentor_id);
              const reason = event.reason as string | undefined;
              setRunStatus('streaming');
              setBubbles((prev) => [
                ...prev,
                { id: nextBubbleId('route'), kind: 'route', speakers, reason } as BubbleState,
              ]);
              break;
            }

            case 'mentor_start': {
              const mentorId = event.mentor_id as string;
              const name = event.name as string;
              const color = event.color as string;
              const bubbleId = nextBubbleId(`mentor_${mentorId}`);
              mentorBubbleIds.set(mentorId, bubbleId);
              setRunStatus('streaming');
              setActiveSpeakers((prev) => new Set([...prev, mentorId]));
              setBubbles((prev) => [
                ...prev,
                { id: bubbleId, kind: 'mentor', mentorId, name, color, text: '', streaming: true } as BubbleState,
              ]);
              break;
            }

            case 'token': {
              const mentorId = event.mentor_id as string;
              const tokenText = event.text as string;

              if (mentorId === 'moderator') {
                // Synthesis token
                setRunStatus('synthesizing');
                if (synthesisBubbleId === null) {
                  synthesisBubbleId = nextBubbleId('synthesis');
                  setBubbles((prev) => [
                    ...prev,
                    { id: synthesisBubbleId || undefined, kind: 'synthesis', text: tokenText, streaming: true } as BubbleState,
                  ]);
                } else {
                  setBubbles((prev) => {
                    return prev.map((bubble) => (
                      bubble.id === synthesisBubbleId && bubble.kind === 'synthesis'
                        ? { ...bubble, text: bubble.text + tokenText }
                        : bubble
                    ));
                  });
                }
              } else {
                // Mentor token — append to their bubble
                const bubbleId = mentorBubbleIds.get(mentorId);
                if (bubbleId !== undefined) {
                  setBubbles((prev) => {
                    return prev.map((bubble) => (
                      bubble.id === bubbleId && bubble.kind === 'mentor'
                        ? { ...bubble, text: bubble.text + tokenText }
                        : bubble
                    ));
                  });
                }
              }
              break;
            }

            case 'mentor_end': {
              const mentorId = event.mentor_id as string;
              const isSilent = event.is_silent as boolean;
              setActiveSpeakers((prev) => {
                const next = new Set(prev);
                next.delete(mentorId);
                return next;
              });

              if (isSilent) {
                // Remove the empty bubble for this silent mentor
                const bubbleId = mentorBubbleIds.get(mentorId);
                if (bubbleId !== undefined) {
                  setBubbles((prev) => prev.filter((bubble) => bubble.id !== bubbleId));
                }
              } else {
                // Mark as done streaming
                const bubbleId = mentorBubbleIds.get(mentorId);
                if (bubbleId !== undefined) {
                  setBubbles((prev) => {
                    return prev.map((bubble) => (
                      bubble.id === bubbleId && bubble.kind === 'mentor'
                        ? { ...bubble, streaming: false }
                        : bubble
                    ));
                  });
                }
              }
              mentorBubbleIds.delete(mentorId);
              break;
            }

            case 'synthesis_start': {
              synthesisBubbleId = null; // Will be created on first token
              setRunStatus('synthesizing');
              break;
            }

            case 'phase': {
              const name = event.name as string;
              setRunStatus('reviewing');
              setBubbles((prev) => [
                ...prev,
                { id: nextBubbleId('phase'), kind: 'phase', name } as BubbleState,
              ]);
              break;
            }

            case 'report': {
              const markdown = event.markdown as string;
              setBubbles((prev) => [
                ...prev,
                { id: nextBubbleId('report'), kind: 'report', text: markdown } as BubbleState,
              ]);
              break;
            }

            case 'done': {
              // Mark synthesis as done
              if (synthesisBubbleId !== null) {
                setBubbles((prev) => {
                  return prev.map((bubble) => (
                    bubble.id === synthesisBubbleId && bubble.kind === 'synthesis'
                      ? { ...bubble, streaming: false }
                      : bubble
                  ));
                });
              }
              setRunStatus('idle');
              setProgressDetail(null);
              break;
            }
          }
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream error');
    } finally {
      setStreaming(false);
      setRunStatus('idle');
      setProgressDetail(null);
      setActiveSpeakers(new Set());
      // Refresh conversations and the active history from persisted state.
      listConversations().then(setConversations).catch(() => {});
      if (convId) {
        getMessages(convId)
          .then((msgs) => {
            if (activeConvIdRef.current === convId) {
              setBubbles(messagesAsBubbles(msgs, mentorsById));
            }
          })
          .catch(() => {});
      }
    }
  }, [activeConvId, mentorsById, streaming]);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#ffffff',
      color: '#1e293b',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflow: 'hidden',
    }}>
      <div style={{ width: `${leftWidth}px`, minWidth: `${LEFT_PANEL.min}px`, maxWidth: `${LEFT_PANEL.max}px`, height: '100%' }}>
        <Sidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
          onExport={handleExportConversation}
          actionsDisabled={streaming}
        />
      </div>
      <div
        role="separator"
        aria-label="Resize conversation sidebar"
        onMouseDown={(event) => handleResizeStart('left', event)}
        style={resizeHandleStyle}
      />

      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        {error && (
          <div style={{
            background: '#fef2f2',
            color: '#dc2626',
            padding: '8px 16px',
            fontSize: '13px',
            borderBottom: '1px solid #fecaca',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px' }}
            >
              ×
            </button>
          </div>
        )}

        <ChatStream
          bubbles={bubbles}
          mentorsById={mentorsById}
          status={runStatus}
          progressDetail={progressDetail}
        />

        <Composer
          mode={mode}
          onModeChange={setMode}
          onSend={handleSend}
          disabled={streaming}
        />
      </main>

      <div
        role="separator"
        aria-label="Resize mentor roster"
        onMouseDown={(event) => handleResizeStart('right', event)}
        style={resizeHandleStyle}
      />
      <div style={{ width: `${rightWidth}px`, minWidth: `${RIGHT_PANEL.min}px`, maxWidth: `${RIGHT_PANEL.max}px`, height: '100%' }}>
        <MentorRoster mentors={mentors} activeSpeakers={activeSpeakers} />
      </div>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

const resizeHandleStyle = {
  width: '6px',
  flex: '0 0 6px',
  cursor: 'col-resize',
  background: '#f8fafc',
  borderLeft: '1px solid #e5e7eb',
  borderRight: '1px solid #e5e7eb',
};

export default App;
