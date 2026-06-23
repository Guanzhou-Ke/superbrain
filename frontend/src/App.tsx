import { useState, useEffect, useCallback, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  listMentors,
  listConversations,
  createConversation,
  listBranches,
  createBranch,
  deleteConversation,
  exportConversation,
  getBranchMessages,
  streamChat,
  type Mentor,
  type Branch,
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
import { extractCaseCandidates, extractInsights, extractRepresentativeCase } from './insights';
import './App.css';

const LEFT_PANEL = { key: 'superbrain.leftPanelWidth', fallback: 220, min: 180, max: 420 };
const RIGHT_PANEL = { key: 'superbrain.rightPanelWidth', fallback: 220, min: 180, max: 480 };

export type ThinkingStage = 'explore' | 'clarify' | 'decide' | 'plan';

export interface StageState {
  stage: ThinkingStage;
  confidence: number;
  why: string;
  framing: string;
}

export interface StageTransitionSuggestion {
  fromStage: ThinkingStage;
  toStage: ThinkingStage;
  reason: string;
}

function App() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [mentorsById, setMentorsById] = useState<Map<string, MentorInfo>>(new Map());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<BubbleState[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ChatMode>('chat');
  const [streaming, setStreaming] = useState(false);
  const [runStatus, setRunStatus] = useState<ChatRunStatus>('idle');
  const [progressDetail, setProgressDetail] = useState<string | null>(null);
  const [statusSteps, setStatusSteps] = useState<string[]>([]);
  const [stageState, setStageState] = useState<StageState | null>(null);
  const [stageSuggestion, setStageSuggestion] = useState<StageTransitionSuggestion | null>(null);
  const [composerDraft, setComposerDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(() => (
    readStoredPanelWidth(localStorage.getItem.bind(localStorage), LEFT_PANEL.key, LEFT_PANEL.fallback, LEFT_PANEL.min, LEFT_PANEL.max)
  ));
  const [rightWidth, setRightWidth] = useState(() => (
    readStoredPanelWidth(localStorage.getItem.bind(localStorage), RIGHT_PANEL.key, RIGHT_PANEL.fallback, RIGHT_PANEL.min, RIGHT_PANEL.max)
  ));
  const activeConvIdRef = useRef<string | null>(null);
  const activeBranchIdRef = useRef<string | null>(null);
  const runStatusRef = useRef<ChatRunStatus>('idle');

  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  useEffect(() => {
    activeBranchIdRef.current = activeBranchId;
  }, [activeBranchId]);

  useEffect(() => {
    runStatusRef.current = runStatus;
  }, [runStatus]);

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

  // Load branches when switching conversation
  useEffect(() => {
    if (!activeConvId) {
      setBranches([]);
      setActiveBranchId(null);
      return;
    }
    listBranches(activeConvId).then((items) => {
      setBranches(items);
      setActiveBranchId((current) => (
        current && items.some((branch) => branch.id === current)
          ? current
          : (items[0]?.id ?? null)
      ));
    }).catch(() => setError('Failed to load branches'));
  }, [activeConvId]);

  // Load messages when switching branch
  useEffect(() => {
    if (!activeConvId || !activeBranchId) return;
    getBranchMessages(activeBranchId).then((msgs) => {
      setBubbles(messagesAsBubbles(msgs, mentorsById));
      setStageState(null);
      setStageSuggestion(null);
    }).catch(() => setError('Failed to load messages'));
  }, [activeConvId, activeBranchId, mentorsById]);

  const handleNewConversation = useCallback(async () => {
    try {
      const { id, root_branch_id } = await createConversation('新会话');
      const updated = await listConversations();
      setConversations(updated);
      setActiveConvId(id);
      setActiveBranchId(root_branch_id);
      setBubbles([]);
      setBranches([]);
      setStageState(null);
      setStageSuggestion(null);
    } catch {
      setError('Failed to create conversation');
    }
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    if (streaming) return;
    setActiveConvId(id);
    setActiveBranchId(null);
    setError(null);
    setStageSuggestion(null);
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
        setActiveBranchId(null);
        if (!next) setBubbles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  }, [conversations, streaming]);

  const handleSelectBranch = useCallback((branchId: string) => {
    if (streaming) return;
    setActiveBranchId(branchId);
    setError(null);
  }, [streaming]);

  const handleForkMessage = useCallback(async (messageId: string, preview: string) => {
    if (streaming || !activeConvId || !activeBranchId) return;
    const defaultTitle = preview.trim().slice(0, 24) || 'Fork';
    const title = window.prompt('新分支标题', defaultTitle);
    if (title === null) return;

    try {
      const { id } = await createBranch(activeConvId, {
        parent_branch_id: activeBranchId,
        forked_from_message_id: messageId,
        title: title.trim() || defaultTitle,
      });
      const updated = await listBranches(activeConvId);
      setBranches(updated);
      setActiveBranchId(id);
      setBubbles([]);
      setStageState(null);
      setStageSuggestion(null);
      setToast(`已创建分支：${title.trim() || defaultTitle}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fork branch');
    }
  }, [activeBranchId, activeConvId, streaming]);

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
    setStatusSteps([]);
    setStageState(null);
    setStageSuggestion(null);
    setComposerDraft(null);

    let convId = activeConvId;
    let branchId = activeBranchId;

    // Auto-create conversation if none selected
    if (!convId) {
      try {
        const { id, root_branch_id } = await createConversation('新会话');
        convId = id;
        branchId = root_branch_id;
        setActiveConvId(id);
        setActiveBranchId(root_branch_id);
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
        { conversation_id: convId, branch_id: branchId, content: text, mode: sendMode },
        (event) => {
          switch (event.type) {
            case 'progress': {
              const status = event.status as ChatRunStatus | undefined;
              const message = event.message as string | undefined;
              if (status) {
                const statusChanged = status !== runStatusRef.current;
                if (statusChanged) {
                  setStatusSteps([]);
                }
                runStatusRef.current = status;
                setRunStatus(status);
              }
              if (message) {
                setProgressDetail(message);
                setStatusSteps((prev) => (prev[prev.length - 1] === message ? prev : [...prev, message]));
              }
              break;
            }

            case 'memory_saved': {
              const content = event.content as string | undefined;
              setToast(content ? `已保存到长期记忆：${content}` : '已保存到长期记忆');
              break;
            }

            case 'stage': {
              const stage = event.stage as ThinkingStage | undefined;
              if (stage) {
                setStageState({
                  stage,
                  confidence: Number(event.confidence || 0),
                  why: String(event.why || ''),
                  framing: String(event.framing || ''),
                });
              }
              break;
            }

            case 'stage_transition': {
              const fromStage = event.from_stage as ThinkingStage | undefined;
              const toStage = event.to_stage as ThinkingStage | undefined;
              const reason = event.reason as string | undefined;
              if (fromStage && toStage && reason) {
                setStageSuggestion({ fromStage, toStage, reason });
              }
              break;
            }

            case 'route': {
              const rawSpeakers = (event.speakers as Array<{mentor_id: string; directive?: string}>) || [];
              const speakers = rawSpeakers.map((speaker) => {
                const mentorId = typeof speaker === 'string' ? speaker : speaker.mentor_id;
                const mentor = mentorsById.get(mentorId);
                return {
                  id: mentorId,
                  name: mentor?.name || mentorId,
                  directive: typeof speaker === 'string' ? undefined : speaker.directive,
                  color: mentor?.color,
                };
              });
              const reason = event.reason as string | undefined;
              runStatusRef.current = 'streaming';
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
              runStatusRef.current = 'streaming';
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
                runStatusRef.current = 'synthesizing';
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
              runStatusRef.current = 'synthesizing';
              setRunStatus('synthesizing');
              break;
            }

            case 'phase': {
              const name = event.name as string;
              runStatusRef.current = 'reviewing';
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
              runStatusRef.current = 'idle';
              setRunStatus('idle');
              setProgressDetail(null);
              setStatusSteps([]);
              break;
            }
          }
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream error');
    } finally {
      setStreaming(false);
      runStatusRef.current = 'idle';
      setRunStatus('idle');
      setProgressDetail(null);
      setStatusSteps([]);
      setActiveSpeakers(new Set());
      listConversations().then(setConversations).catch(() => {});
      if (convId) {
        listBranches(convId).then(setBranches).catch(() => {});
      }
      if (branchId) {
        getBranchMessages(branchId)
          .then((msgs) => {
            if (activeConvIdRef.current === convId && activeBranchIdRef.current === branchId) {
              setBubbles(messagesAsBubbles(msgs, mentorsById));
            }
          })
          .catch(() => {});
      }
    }
  }, [activeBranchId, activeConvId, mentorsById, streaming]);

  const insights = extractInsights(bubbles, stageState?.stage ?? null);
  const representativeCase = extractRepresentativeCase(bubbles);
  const caseCandidates = extractCaseCandidates(bubbles);

  const handleCaseAction = useCallback((
    action: 'probe' | 'compare' | 'experiment',
    caseText: string,
    compareTarget?: string,
  ) => {
    if (action === 'probe') {
      setMode('clarify');
      setComposerDraft(`围绕这个 case 深挖：\n\n${caseText}\n\n请你不要泛泛总结，而是回答：这个 case 真正说明了什么？它依赖了什么前提？如果把这个判断推到我的问题上，最值得继续追问的分歧是什么？`);
      return;
    }

    if (action === 'compare') {
      setMode('clarify');
      setComposerDraft(`请对比这两个 case：\n\nCase A:\n${caseText}\n\nCase B:\n${compareTarget || '请你补一个最合适的对照 case'}\n\n我想知道这两个 case 在问题设定、成功前提、失败模式和研究价值上最关键的差异是什么。不要列很多点，只抓最决定性的 tradeoff。`);
      return;
    }

    setMode('plan');
    setComposerDraft(`请把这个 case 转成实验问题：\n\n${caseText}\n\n请帮我把它改写成一个可以验证的研究假设，并给出最小实验、baseline、关键指标和最可能失败的地方。`);
  }, []);

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

        {activeConvId && branches.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderBottom: '1px solid #e5e7eb',
            background: '#f8fafc',
            overflowX: 'auto',
          }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#64748b',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              flex: '0 0 auto',
            }}>
              Branches
            </span>
            {branches.map((branch) => {
              const isActive = branch.id === activeBranchId;
              const isFork = Boolean(branch.parent_branch_id);
              return (
                <button
                  key={branch.id}
                  onClick={() => handleSelectBranch(branch.id)}
                  style={{
                    flex: '0 0 auto',
                    padding: '6px 10px',
                    borderRadius: '999px',
                    border: isActive ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                    background: isActive ? '#eff6ff' : '#ffffff',
                    color: isActive ? '#1d4ed8' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: streaming ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  disabled={streaming}
                  title={branch.title}
                >
                  {isFork ? 'Fork' : 'Main'}: {branch.title || (isFork ? 'Fork' : 'Main')}
                </button>
              );
            })}
          </div>
        )}

        <ChatStream
          bubbles={bubbles}
          mentorsById={mentorsById}
          status={runStatus}
          progressDetail={progressDetail}
          statusSteps={statusSteps}
          stageState={stageState}
          representativeCase={representativeCase}
          availableCases={caseCandidates}
          onCaseAction={handleCaseAction}
          onForkMessage={handleForkMessage}
        />

        <Composer
          mode={mode}
          onModeChange={setMode}
          onSend={handleSend}
          disabled={streaming}
          suggestion={stageSuggestion}
          draftText={composerDraft}
        />
      </main>

      <div
        role="separator"
        aria-label="Resize mentor roster"
        onMouseDown={(event) => handleResizeStart('right', event)}
        style={resizeHandleStyle}
      />
      <div style={{ width: `${rightWidth}px`, minWidth: `${RIGHT_PANEL.min}px`, maxWidth: `${RIGHT_PANEL.max}px`, height: '100%' }}>
        <MentorRoster
          mentors={mentors}
          activeSpeakers={activeSpeakers}
          insights={insights}
          stage={stageState?.stage ?? null}
        />
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
