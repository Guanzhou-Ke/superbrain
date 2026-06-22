import { useState, useEffect, useCallback } from 'react';
import {
  listMentors,
  listConversations,
  createConversation,
  getMessages,
  streamChat,
  type Mentor,
  type Conversation,
  type Message,
} from './api';
import { Sidebar } from './components/Sidebar';
import { ChatStream } from './components/ChatStream';
import { MentorRoster } from './components/MentorRoster';
import { Composer, type ChatMode } from './components/Composer';
import './App.css';

export interface MentorInfo {
  id: string;
  name: string;
  color: string;
}

// Discriminated union for all bubble types in the chat stream
export type BubbleState =
  | { kind: 'user'; text: string; mentorId: never; name: never; color: never; streaming: never; speakers: never; reason: never }
  | { kind: 'route'; speakers: string[]; reason?: string; text: never; mentorId: never; name: never; color: never; streaming: never }
  | { kind: 'mentor'; mentorId: string; name: string; color: string; text: string; streaming: boolean; speakers: never; reason: never }
  | { kind: 'synthesis'; text: string; streaming: boolean; mentorId: never; name: never; color: never; speakers: never; reason: never }
  | { kind: 'phase'; name: string; text: never; mentorId: never; color: never; streaming: never; speakers: never; reason: never }
  | { kind: 'report'; text: string; mentorId: never; name: never; color: never; streaming: never; speakers: never; reason: never };

function messagesAsBubbles(messages: Message[], mentorsById: Map<string, MentorInfo>): BubbleState[] {
  const bubbles: BubbleState[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      bubbles.push({
        kind: 'user',
        text: msg.content,
      } as BubbleState);
    } else if (msg.role === 'assistant') {
      const mentorId = msg.mentor_id || 'moderator';
      const mentor = mentorsById.get(mentorId);
      if (mentorId === 'moderator') {
        bubbles.push({
          kind: 'synthesis',
          text: msg.content,
          streaming: false,
        } as BubbleState);
      } else {
        bubbles.push({
          kind: 'mentor',
          mentorId,
          name: mentor?.name || mentorId,
          color: mentor?.color || '#555',
          text: msg.content,
          streaming: false,
        } as BubbleState);
      }
    }
  }
  return bubbles;
}

function App() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [mentorsById, setMentorsById] = useState<Map<string, MentorInfo>>(new Map());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<BubbleState[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ChatMode>('chat');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!activeConvId) {
      setBubbles([]);
      return;
    }
    getMessages(activeConvId).then((msgs) => {
      setBubbles(messagesAsBubbles(msgs, mentorsById));
    }).catch(() => setError('Failed to load messages'));
  }, [activeConvId, mentorsById]);

  const handleNewConversation = useCallback(async () => {
    const title = `Conversation ${new Date().toLocaleString()}`;
    try {
      const { id } = await createConversation(title);
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

  const handleSend = useCallback(async (text: string, sendMode: ChatMode) => {
    if (streaming) return;
    setError(null);
    setStreaming(true);

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
        return;
      }
    }

    // Add user bubble immediately
    const userBubble: BubbleState = { kind: 'user', text } as BubbleState;
    setBubbles((prev) => [...prev, userBubble]);

    // Track in-progress mentor bubbles by mentorId -> index in bubbles array
    // We use a mutable map scoped to this send call
    const mentorBubbleIndex = new Map<string, number>();
    let synthesisIndex = -1;

    try {
      await streamChat(
        { conversation_id: convId, content: text, mode: sendMode },
        (event) => {
          switch (event.type) {
            case 'route': {
              const speakers = (event.speakers as string[]) || [];
              const reason = event.reason as string | undefined;
              setBubbles((prev) => [
                ...prev,
                { kind: 'route', speakers, reason } as BubbleState,
              ]);
              break;
            }

            case 'mentor_start': {
              const mentorId = event.mentor_id as string;
              const name = event.name as string;
              const color = event.color as string;
              setActiveSpeakers((prev) => new Set([...prev, mentorId]));
              setBubbles((prev) => {
                const idx = prev.length;
                mentorBubbleIndex.set(mentorId, idx);
                return [
                  ...prev,
                  { kind: 'mentor', mentorId, name, color, text: '', streaming: true } as BubbleState,
                ];
              });
              break;
            }

            case 'token': {
              const mentorId = event.mentor_id as string;
              const tokenText = event.text as string;

              if (mentorId === 'moderator') {
                // Synthesis token
                if (synthesisIndex === -1) {
                  setBubbles((prev) => {
                    synthesisIndex = prev.length;
                    return [
                      ...prev,
                      { kind: 'synthesis', text: tokenText, streaming: true } as BubbleState,
                    ];
                  });
                } else {
                  setBubbles((prev) => {
                    const updated = [...prev];
                    const bubble = updated[synthesisIndex];
                    if (bubble && bubble.kind === 'synthesis') {
                      updated[synthesisIndex] = { ...bubble, text: bubble.text + tokenText };
                    }
                    return updated;
                  });
                }
              } else {
                // Mentor token — append to their bubble
                const idx = mentorBubbleIndex.get(mentorId);
                if (idx !== undefined) {
                  setBubbles((prev) => {
                    const updated = [...prev];
                    const bubble = updated[idx];
                    if (bubble && bubble.kind === 'mentor') {
                      updated[idx] = { ...bubble, text: bubble.text + tokenText };
                    }
                    return updated;
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
                const idx = mentorBubbleIndex.get(mentorId);
                if (idx !== undefined) {
                  setBubbles((prev) => prev.filter((_, i) => i !== idx));
                  // Adjust indices for bubbles that came after
                  mentorBubbleIndex.forEach((v, k) => {
                    if (v > idx) mentorBubbleIndex.set(k, v - 1);
                  });
                  if (synthesisIndex > idx) synthesisIndex--;
                }
              } else {
                // Mark as done streaming
                const idx = mentorBubbleIndex.get(mentorId);
                if (idx !== undefined) {
                  setBubbles((prev) => {
                    const updated = [...prev];
                    const bubble = updated[idx];
                    if (bubble && bubble.kind === 'mentor') {
                      updated[idx] = { ...bubble, streaming: false };
                    }
                    return updated;
                  });
                }
              }
              mentorBubbleIndex.delete(mentorId);
              break;
            }

            case 'synthesis_start': {
              synthesisIndex = -1; // Will be created on first token
              break;
            }

            case 'phase': {
              const name = event.name as string;
              setBubbles((prev) => [
                ...prev,
                { kind: 'phase', name } as BubbleState,
              ]);
              break;
            }

            case 'report': {
              const markdown = event.markdown as string;
              setBubbles((prev) => [
                ...prev,
                { kind: 'report', text: markdown } as BubbleState,
              ]);
              break;
            }

            case 'done': {
              // Mark synthesis as done
              if (synthesisIndex !== -1) {
                setBubbles((prev) => {
                  const updated = [...prev];
                  const bubble = updated[synthesisIndex];
                  if (bubble && bubble.kind === 'synthesis') {
                    updated[synthesisIndex] = { ...bubble, streaming: false };
                  }
                  return updated;
                });
              }
              break;
            }
          }
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream error');
    } finally {
      setStreaming(false);
      setActiveSpeakers(new Set());
      // Refresh conversations list to update timestamps
      listConversations().then(setConversations).catch(() => {});
    }
  }, [activeConvId, streaming]);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#ffffff',
      color: '#1e293b',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflow: 'hidden',
    }}>
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
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

        <ChatStream bubbles={bubbles} mentorsById={mentorsById} />

        <Composer
          mode={mode}
          onModeChange={setMode}
          onSend={handleSend}
          disabled={streaming}
        />
      </main>

      <MentorRoster mentors={mentors} activeSpeakers={activeSpeakers} />
    </div>
  );
}

export default App;
