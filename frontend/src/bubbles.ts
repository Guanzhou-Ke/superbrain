import type { Message } from './api';

export interface MentorInfo {
  id: string;
  name: string;
  color: string;
}

// Discriminated union for all bubble types in the chat stream.
export type BubbleState =
  | { id?: string; kind: 'user'; text: string; mentorId: never; name: never; color: never; streaming: never; speakers: never; reason: never }
  | { id?: string; kind: 'route'; speakers: string[]; reason?: string; text: never; mentorId: never; name: never; color: never; streaming: never }
  | { id?: string; kind: 'mentor'; mentorId: string; name: string; color: string; text: string; streaming: boolean; speakers: never; reason: never }
  | { id?: string; kind: 'synthesis'; text: string; streaming: boolean; mentorId: never; name: never; color: never; speakers: never; reason: never }
  | { id?: string; kind: 'phase'; name: string; text: never; mentorId: never; color: never; streaming: never; speakers: never; reason: never }
  | { id?: string; kind: 'report'; text: string; mentorId: never; name: never; color: never; streaming: never; speakers: never; reason: never };

export function messagesAsBubbles(messages: Message[], mentorsById: Map<string, MentorInfo>): BubbleState[] {
  const bubbles: BubbleState[] = [];
  for (const msg of messages) {
    if (msg.is_silent) continue;
    if (msg.role === 'user') {
      bubbles.push({
        id: msg.id,
        kind: 'user',
        text: msg.content,
      } as BubbleState);
    } else if (msg.role === 'mentor' || msg.role === 'moderator' || msg.role === 'assistant') {
      const mentorId = msg.mentor_id || 'moderator';
      const mentor = mentorsById.get(mentorId);
      if (mentorId === 'moderator') {
        if (msg.mode === 'review') {
          bubbles.push({
            id: msg.id,
            kind: 'report',
            text: msg.content,
          } as BubbleState);
        } else {
          bubbles.push({
            id: msg.id,
            kind: 'synthesis',
            text: msg.content,
            streaming: false,
          } as BubbleState);
        }
      } else {
        bubbles.push({
          id: msg.id,
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
