/**
 * The state machine for one chat turn, as a pure reducer. `useResearchChat` performs the side effects (requests,
 * streaming, cache updates) and reports what happened here; everything the UI shows follows from this file.
 *
 *   idle ── begin ──> thinking <── step / evidence ──> streaming
 *                        │                                │
 *                        └── any terminal action ── idle ─┘
 *
 * Terminal actions: session_failed, rate_limited, aborted, connection_lost, abandoned, stream_closed.
 * `stream_closed` without a preceding `done` or `error` event counts as a lost connection.
 *
 * Actions carry their turn's id, and anything from a turn that is no longer current is ignored, so a cancelled
 * stream can't write into the conversation that replaced it.
 *
 * The server doesn't save failed or stopped replies. Those stay in `unsaved` and are laid over later history syncs,
 * otherwise the refetch that follows every turn would erase them from the screen.
 */
import type { ChatMessage, ResearchTrace } from '@/api/chat';
import { applyResearchEvent, type ResearchActivityItem, type ResearchProgressEvent } from './researchProgress';

export type CopilotStatus = 'idle' | 'thinking' | 'streaming';

type CitationList = NonNullable<ChatMessage['citations']>;

/** One server-sent event from the chat stream. */
export interface ChatStreamEvent extends ResearchProgressEvent {
  step?: string;
  citations?: CitationList;
  delta?: string;
  done?: boolean;
  content?: string;
  message_id?: string;
  session_title?: string;
  session_summary?: string;
  suggestions?: string[];
  research_trace?: ResearchTrace | null;
  /** Sent instead of an answer when generation failed; the reply isn't saved server-side. */
  error?: string;
  error_code?: string;
}

interface TurnProgress {
  id: string;
  /** Null until the first message of a fresh conversation has created its session. */
  sessionId: string | null;
  assistantId: string;
  userMessageId: string | null;
  activity: ResearchActivityItem[];
  answer: string;
  citations: CitationList;
  /** The stream delivered its final event, and only needs to close. */
  settled: boolean;
  /** The server stored the answer, so nothing has to be kept locally. */
  saved: boolean;
}

export type ActiveTurn = TurnProgress & ({ phase: 'thinking'; step: string } | { phase: 'streaming'; step: null });
export type ChatTurn = { phase: 'idle'; step: null } | ActiveTurn;

export interface ChatState {
  messages: ChatMessage[];
  /** This conversation's latest messages the server doesn't have. */
  unsaved: ChatMessage[];
  turn: ChatTurn;
}

export type ChatAction =
  | { type: 'history'; sessionId: string | null; history: ChatMessage[] | undefined }
  | { type: 'begin'; turnId: string; sessionId: string | null }
  | { type: 'session_failed'; turnId: string }
  | { type: 'request_started'; turnId: string; sessionId: string; userMessage: ChatMessage }
  | { type: 'rate_limited'; turnId: string; content: string; createdAt: string }
  | { type: 'stream_opened'; turnId: string; createdAt: string }
  | { type: 'stream_event'; turnId: string; event: ChatStreamEvent }
  | { type: 'aborted'; turnId: string }
  | { type: 'connection_lost'; turnId: string; createdAt: string }
  | { type: 'stream_closed'; turnId: string; createdAt: string }
  | { type: 'abandoned'; turnId: string };

const IDLE: ChatTurn = { phase: 'idle', step: null };
export const INITIAL_CHAT_STATE: ChatState = { messages: [], unsaved: [], turn: IDLE };

/** Lays the local-only tail of a conversation over what the server returned, without doubling anything it did save. */
export function mergeHistory(history: ChatMessage[], unsaved: ChatMessage[], sessionId: string): ChatMessage[] {
  const local = unsaved.filter((m) => m.session_id === sessionId);
  if (local.length === 0) return history;
  const lastSavedUser = [...history].reverse().find((m) => m.role === 'user');
  const newUserMessages = local.filter((m) => m.role === 'user' && m.content !== lastSavedUser?.content);
  // An assistant message after the question it answers means the reply was saved after all
  const answeredByServer = newUserMessages.length === 0 && history[history.length - 1]?.role === 'assistant';
  return [...history, ...newUserMessages, ...(answeredByServer ? [] : local.filter((m) => m.role !== 'user'))];
}

function updateAssistant(messages: ChatMessage[], id: string, update: (message: ChatMessage) => ChatMessage): ChatMessage[] {
  return messages.map((m) => (m.id === id ? update(m) : m));
}

function settle(turn: ActiveTurn, messages: ChatMessage[]): ChatState {
  const unsaved = turn.saved ? [] : messages.filter((m) => m.id === turn.userMessageId || m.id === turn.assistantId);
  return { messages, unsaved, turn: IDLE };
}

function loseConnection(state: ChatState, turn: ActiveTurn, createdAt: string): ChatState {
  const assistant = state.messages.find((m) => m.id === turn.assistantId);
  const messages: ChatMessage[] = assistant
    ? updateAssistant(state.messages, turn.assistantId, (m) => ({
        ...m,
        content: `${m.content}\n\n*Generation stopped: the connection dropped.*`,
        status: 'error',
      }))
    : [
        ...state.messages,
        {
          id: turn.assistantId,
          session_id: turn.sessionId ?? '',
          role: 'assistant',
          content: '*The research agent could not be reached. Check your connection and send again.*',
          status: 'error',
          created_at: createdAt,
        },
      ];
  return settle(turn, messages);
}

function applyStreamEvent(state: ChatState, current: ActiveTurn, data: ChatStreamEvent): ChatState {
  if (data.error) {
    const reason = data.error;
    return {
      ...state,
      messages: updateAssistant(state.messages, current.assistantId, (m) => ({ ...m, content: `*${reason}*`, status: 'error' })),
      turn: { ...current, phase: 'streaming', step: null, settled: true },
    };
  }

  let turn = current;
  let messages = state.messages;

  if (data.status === 'step' || data.status === 'search' || data.status === 'evidence') {
    turn = { ...turn, activity: applyResearchEvent(turn.activity, data) };
  }
  if ((data.status === 'step' || data.status === 'evidence') && data.step) {
    turn = { ...turn, phase: 'thinking', step: data.step };
  }
  if (Array.isArray(data.citations)) turn = { ...turn, citations: data.citations };

  if (data.delta) {
    const answer = turn.answer + data.delta;
    turn = { ...turn, phase: 'streaming', step: null, answer };
    messages = updateAssistant(messages, turn.assistantId, (m) => ({ ...m, content: answer, status: 'streaming' }));
  }

  if (data.done) {
    const { citations, answer, assistantId } = turn;
    messages = updateAssistant(messages, assistantId, (m) => ({
      ...m,
      id: data.message_id || m.id,
      content: data.content || answer,
      citations: citations.length > 0 ? citations : m.citations,
      suggested_questions: data.suggestions?.length ? data.suggestions : m.suggested_questions,
      research_trace: data.research_trace ?? m.research_trace,
      status: 'completed',
    }));
    turn = { ...turn, assistantId: data.message_id || assistantId, settled: true, saved: true };
  } else if (data.content && !turn.answer) {
    const answer = data.content;
    turn = { ...turn, answer, settled: true };
    messages = updateAssistant(messages, turn.assistantId, (m) => ({ ...m, content: answer, status: 'completed' }));
  }

  return { ...state, messages, turn };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === 'history') {
    if (state.turn.phase !== 'idle') return state;
    const { sessionId, history } = action;
    if (!sessionId) return { ...state, messages: [], unsaved: [] };
    const unsaved = state.unsaved.filter((m) => m.session_id === sessionId);
    return { ...state, messages: mergeHistory(history ?? [], unsaved, sessionId), unsaved };
  }

  if (action.type === 'begin') {
    if (state.turn.phase !== 'idle') return state;
    return {
      ...state,
      turn: {
        phase: 'thinking',
        step: 'Preparing research query',
        id: action.turnId,
        sessionId: action.sessionId,
        assistantId: action.turnId,
        userMessageId: null,
        activity: [],
        answer: '',
        citations: [],
        settled: false,
        saved: false,
      },
    };
  }

  const turn = state.turn;
  if (turn.phase === 'idle' || turn.id !== action.turnId) return state;

  switch (action.type) {
    case 'session_failed':
      return { ...state, turn: IDLE };

    case 'request_started':
      return {
        ...state,
        messages: [...state.messages, action.userMessage],
        turn: { ...turn, sessionId: action.sessionId, userMessageId: action.userMessage.id },
      };

    case 'rate_limited':
      return settle(turn, [
        ...state.messages,
        {
          id: turn.assistantId,
          session_id: turn.sessionId ?? '',
          role: 'assistant',
          content: action.content,
          status: 'error',
          created_at: action.createdAt,
        },
      ]);

    case 'stream_opened':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: turn.assistantId,
            session_id: turn.sessionId ?? '',
            role: 'assistant',
            content: '',
            status: 'streaming',
            created_at: action.createdAt,
          },
        ],
      };

    case 'stream_event':
      return applyStreamEvent(state, turn, action.event);

    case 'aborted': {
      // Stopped before any text arrived: there is no reply to keep
      const kept = state.messages.filter((m) => m.id !== turn.assistantId || m.content.trim());
      return settle(turn, updateAssistant(kept, turn.assistantId, (m) => ({ ...m, status: 'completed' })));
    }

    case 'connection_lost':
      return loseConnection(state, turn, action.createdAt);

    case 'stream_closed':
      return turn.settled ? settle(turn, state.messages) : loseConnection(state, turn, action.createdAt);

    case 'abandoned':
      return { ...state, unsaved: [], turn: IDLE };
  }
}
