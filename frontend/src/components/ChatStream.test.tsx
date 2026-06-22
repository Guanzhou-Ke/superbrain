// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatStream } from './ChatStream';
import type { BubbleState, MentorInfo } from '../bubbles';

const mentorsById = new Map<string, MentorInfo>();

describe('ChatStream', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders markdown content as structured HTML', () => {
    const bubbles = [{
      kind: 'report',
      text: '# Review\n\n| A | B |\n| - | - |\n| x | y |',
    } as BubbleState];

    const { container } = render(
      <ChatStream bubbles={bubbles} mentorsById={mentorsById} status="idle" />,
    );

    expect(container.querySelector('h1')?.textContent).toBe('Review');
    expect(container.querySelector('table')?.textContent).toContain('xy');
  });

  it('renders inline and block math with KaTeX', () => {
    const bubbles = [{
      kind: 'synthesis',
      text: 'Inline $E=mc^2$\n\n$$\\int_0^1 x^2 dx$$',
      streaming: false,
    } as BubbleState];

    const { container } = render(
      <ChatStream bubbles={bubbles} mentorsById={mentorsById} status="idle" />,
    );

    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.katex-display')).toBeTruthy();
  });

  it('renders code blocks with light-theme styling', () => {
    const bubbles = [{
      kind: 'mentor',
      mentorId: 'alice',
      name: 'Alice',
      color: '#2563eb',
      text: '```latex\nE=mc^2\n```',
      streaming: false,
    } as BubbleState];

    const { container } = render(
      <ChatStream bubbles={bubbles} mentorsById={mentorsById} status="idle" />,
    );
    const pre = container.querySelector('pre') as HTMLElement | null;
    const code = container.querySelector('pre code') as HTMLElement | null;

    expect(pre?.style.background).toBe('rgb(248, 250, 252)');
    expect(pre?.style.color).toBe('rgb(15, 23, 42)');
    expect(code?.style.background).toBe('transparent');
  });

  it('shows the status capsule after the user message in the chat flow', () => {
    const bubbles = [{
      kind: 'user',
      text: '帮我分析这个想法',
    } as BubbleState];

    const { container, getByRole, getByText } = render(
      <ChatStream
        bubbles={bubbles}
        mentorsById={mentorsById}
        status="routing"
        progressDetail="分析问题并编排导师"
      />,
    );
    const userBubble = getByText('帮我分析这个想法');
    const status = getByRole('status');

    expect(status.textContent).toContain('正在思考');
    expect(status.textContent).toContain('分析问题并编排导师');
    expect(
      Array.from(container.querySelectorAll('[data-chat-item]')).map((node) => node.getAttribute('data-chat-item')),
    ).toEqual(['user', 'status']);
    expect(userBubble.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
