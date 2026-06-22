import { describe, expect, it } from 'vitest';
import { messagesAsBubbles, type MentorInfo } from './bubbles';
import type { Message } from './api';

describe('messagesAsBubbles', () => {
  it('skips silent messages and restores review moderator messages as reports', () => {
    const mentorsById = new Map<string, MentorInfo>([
      ['alice', { id: 'alice', name: 'Alice', color: '#111' }],
    ]);
    const messages = [
      {
        id: 'u1',
        role: 'user',
        content: 'review this',
        mentor_id: null,
        mode: 'chat',
        is_silent: 0,
      },
      {
        id: 'm1',
        role: 'mentor',
        content: '',
        mentor_id: 'alice',
        mode: 'chat',
        is_silent: 1,
      },
      {
        id: 'r1',
        role: 'moderator',
        content: '# Report',
        mentor_id: 'moderator',
        mode: 'review',
        is_silent: 0,
      },
    ] as Message[];

    expect(messagesAsBubbles(messages, mentorsById)).toMatchObject([
      { id: 'u1', kind: 'user', text: 'review this' },
      { id: 'r1', kind: 'report', text: '# Report' },
    ]);
  });
});
