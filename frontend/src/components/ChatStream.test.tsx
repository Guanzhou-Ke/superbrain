// @vitest-environment jsdom
import { fireEvent, render, within } from '@testing-library/react';
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
        progressDetail="分析问题并编排专家视角"
      />,
    );
    const userBubble = getByText('帮我分析这个想法');
    const status = getByRole('status');

    expect(status.textContent).toContain('正在思考');
    expect(status.textContent).toContain('分析问题并编排专家视角');
    expect(
      Array.from(container.querySelectorAll('[data-chat-item]')).map((node) => node.getAttribute('data-chat-item')),
    ).toEqual(['user', 'status']);
    expect(userBubble.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the active stage panel while a run is in progress', () => {
    const bubbles = [{
      kind: 'user',
      text: '请分析这个方向',
    } as BubbleState];

    const { getAllByRole, getByText } = render(
      <ChatStream
        bubbles={bubbles}
        mentorsById={mentorsById}
        status="routing"
        progressDetail="已邀请 Alice、Bob 发言"
      />,
    );
    const status = getAllByRole('status').at(-1);

    expect(status?.textContent).toContain('Route');
    expect(status?.textContent).toContain('Debate');
    expect(getByText('已邀请 Alice、Bob 发言')).toBeTruthy();
  });

  it('renders stage-internal checklist steps for routing', () => {
    const bubbles = [{
      kind: 'user',
      text: '帮我想想这个方向',
    } as BubbleState];

    const { getAllByText } = render(
      <ChatStream
        bubbles={bubbles}
        mentorsById={mentorsById}
        status="routing"
        progressDetail="已邀请 Alice、Bob 发言"
        statusSteps={['读取长期记忆', '判断当前思考阶段', '分析问题并编排导师', '已邀请 Alice、Bob 发言']}
      />,
    );

    expect(getAllByText('读取长期记忆').length).toBeGreaterThan(0);
    expect(getAllByText('判断当前思考阶段').length).toBeGreaterThan(0);
    expect(getAllByText('分析问题并编排导师').length).toBeGreaterThan(0);
    expect(getAllByText('已邀请 Alice、Bob 发言').length).toBeGreaterThan(0);
  });

  it('renders a representative case card when available', () => {
    const bubbles = [{
      kind: 'mentor',
      mentorId: 'alice',
      name: 'Alice',
      color: '#2563eb',
      text: '以 ImageNet 之后很多 leaderboard 导向工作为例，真正有价值的研究解释了为什么表征能够迁移。',
      streaming: false,
    } as BubbleState];

    const { getByText, getAllByText, queryByText } = render(
      <ChatStream
        bubbles={bubbles}
        mentorsById={mentorsById}
        status="idle"
        representativeCase={{
          id: 'case_1',
          source: 'Alice',
          color: '#2563eb',
          text: '以 ImageNet 之后很多 leaderboard 导向工作为例，真正有价值的研究解释了为什么表征能够迁移。',
          signal: 'expand',
          status: 'confirmed',
          rationale: '这个 case 值得展开，因为它比抽象判断更能解释问题。',
        }}
      />,
    );

    expect(getByText('Representative Case')).toBeTruthy();
    expect(getAllByText('Alice').length).toBeGreaterThan(0);
    expect(getAllByText(/ImageNet/).length).toBeGreaterThan(0);
    expect(queryByText('这个 case 值得展开，因为它比抽象判断更能解释问题。')).toBeNull();

    fireEvent.click(getByText('展开案例'));

    expect(getByText('收起案例')).toBeTruthy();
    expect(getByText('这个 case 值得展开，因为它比抽象判断更能解释问题。')).toBeTruthy();
  });

  it('emits case actions for follow-up workflows', () => {
    const onCaseAction = vi.fn();

    const { getAllByText } = render(
      <ChatStream
        bubbles={[]}
        mentorsById={mentorsById}
        status="idle"
        onCaseAction={onCaseAction}
        availableCases={[
          {
            id: 'case_1',
            source: 'Alice',
            color: '#2563eb',
            text: '以 ImageNet 之后很多 leaderboard 导向工作为例，真正有价值的研究解释了为什么表征能够迁移。',
            signal: 'expand',
            status: 'confirmed',
            rationale: '这个 case 值得展开，因为它比抽象判断更能解释问题。',
          },
          {
            id: 'case_2',
            source: 'Deep Review',
            color: '#7c3aed',
            text: '反例：如果评估只覆盖训练分布，很多看起来优秀的研究会在真实环境里失败。',
            signal: 'expand',
            status: 'confirmed',
            rationale: '这个 case 值得展开，因为它直接暴露了失败边界。',
          },
        ]}
        representativeCase={{
          id: 'case_1',
          source: 'Alice',
          color: '#2563eb',
          text: '以 ImageNet 之后很多 leaderboard 导向工作为例，真正有价值的研究解释了为什么表征能够迁移。',
          signal: 'expand',
          status: 'confirmed',
          rationale: '这个 case 值得展开，因为它比抽象判断更能解释问题。',
        }}
      />,
    );

    fireEvent.click(getAllByText('围绕这个 case 深挖').at(-1)!);
    fireEvent.click(getAllByText('对比另一个 case').at(-1)!);
    fireEvent.click(getAllByText(/反例：如果评估只覆盖训练分布/).at(-1)!);
    fireEvent.click(getAllByText('转成实验问题').at(-1)!);

    expect(onCaseAction).toHaveBeenNthCalledWith(
      1,
      'probe',
      '以 ImageNet 之后很多 leaderboard 导向工作为例，真正有价值的研究解释了为什么表征能够迁移。',
    );
    expect(onCaseAction).toHaveBeenNthCalledWith(
      2,
      'compare',
      '以 ImageNet 之后很多 leaderboard 导向工作为例，真正有价值的研究解释了为什么表征能够迁移。',
      '反例：如果评估只覆盖训练分布，很多看起来优秀的研究会在真实环境里失败。',
    );
    expect(onCaseAction).toHaveBeenNthCalledWith(
      3,
      'experiment',
      '以 ImageNet 之后很多 leaderboard 导向工作为例，真正有价值的研究解释了为什么表征能够迁移。',
    );
  });

  it('shows case actions inline for mentor bubbles that contain a case', () => {
    const { getAllByText } = render(
      <ChatStream
        bubbles={[{
          kind: 'mentor',
          mentorId: 'alice',
          name: 'Alice',
          color: '#2563eb',
          text: '以 ImageNet 之后很多 leaderboard 导向工作为例，真正留下来的研究都解释了表征为什么能迁移。',
          streaming: false,
        } as BubbleState]}
        mentorsById={mentorsById}
        status="idle"
      />,
    );

    expect(getAllByText('围绕这个 case 深挖').length).toBeGreaterThan(0);
    expect(getAllByText('对比另一个 case').length).toBeGreaterThan(0);
    expect(getAllByText('转成实验问题').length).toBeGreaterThan(0);
  });

  it('does not show case actions for weak candidate cases', () => {
    const { container } = render(
      <ChatStream
        bubbles={[{
          kind: 'mentor',
          mentorId: 'alice',
          name: 'Alice',
          color: '#2563eb',
          text: '比如 Transformer 在很多任务上表现不错，但这里只是一个很粗的类比。',
          streaming: false,
        } as BubbleState]}
        mentorsById={mentorsById}
        status="idle"
      />,
    );

    const scope = within(container);
    expect(scope.queryByText('围绕这个 case 深挖')).toBeNull();
    expect(scope.queryByText('对比另一个 case')).toBeNull();
    expect(scope.queryByText('转成实验问题')).toBeNull();
  });

  it('emits fork callbacks at the bottom of each answer group', () => {
    const onForkMessage = vi.fn();

    const { getByText, queryByText } = render(
      <ChatStream
        bubbles={[
          { id: 'u1', kind: 'user', text: '从这里分叉' } as BubbleState,
          {
            id: 'm1',
            kind: 'mentor',
            mentorId: 'alice',
            name: 'Alice',
            color: '#2563eb',
            text: '这里也可以分叉',
            streaming: false,
          } as BubbleState,
        ]}
        mentorsById={mentorsById}
        status="idle"
        onForkMessage={onForkMessage}
      />,
    );

    expect(queryByText('Fork from here')).toBeNull();

    fireEvent.click(getByText('Fork'));

    expect(onForkMessage).toHaveBeenCalledTimes(1);
    expect(onForkMessage).toHaveBeenCalledWith('m1', '这里也可以分叉');
  });

  it('uses the final persisted answer message as the fork point for a multi-message group', () => {
    const onForkMessage = vi.fn();

    const { container } = render(
      <ChatStream
        bubbles={[
          { id: 'u1', kind: 'user', text: '问题' } as BubbleState,
          {
            id: 'm1',
            kind: 'mentor',
            mentorId: 'alice',
            name: 'Alice',
            color: '#2563eb',
            text: '导师回答',
            streaming: false,
          } as BubbleState,
          {
            id: 's1',
            kind: 'synthesis',
            text: '主持人总结',
            streaming: false,
          } as BubbleState,
        ]}
        mentorsById={mentorsById}
        status="idle"
        onForkMessage={onForkMessage}
      />,
    );

    fireEvent.click(within(container).getByText('Fork'));

    expect(onForkMessage).toHaveBeenCalledWith('s1', '主持人总结');
  });
});
