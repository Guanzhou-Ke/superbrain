import { describe, expect, it } from 'vitest';
import { extractCaseCandidates, extractCaseFromText, extractInsights, extractRepresentativeCase } from './insights';
import type { BubbleState } from './bubbles';

describe('extractInsights', () => {
  it('prioritizes high-signal, case-backed takeaways and skips moderator text', () => {
    const bubbles = [
      {
        kind: 'mentor',
        mentorId: 'hinton',
        name: '杰弗里·辛顿',
        color: '#0891B2',
        text: '好的研究必须迫使我们修正关于泛化的核心假设，而不是只把 benchmark 再刷高一点。以 ImageNet 之后很多只追 leaderboard 的工作为例，真正能留下来的，是那些解释了为什么表征可以迁移到新任务的研究。研究不能只追求局部指标，还要解释为什么机制可以迁移到新问题。',
        streaming: false,
      },
      {
        kind: 'synthesis',
        text: '核心结论：好的研究既要提出新机制，也要明确证明它为什么在现实条件下仍然成立。',
        streaming: false,
      },
      {
        kind: 'report',
        text: '关键风险：如果评估设计只覆盖训练分布，研究结论会被高估。',
        streaming: false,
      },
    ] as BubbleState[];

    const insights = extractInsights(bubbles);

    expect(insights.length).toBeGreaterThan(0);
    const hinton = insights.find((item) => item.source === '杰弗里·辛顿');
    const review = insights.find((item) => item.source === 'Deep Review');

    expect(hinton).toBeTruthy();
    expect(hinton?.signal).toBe('expand');
    expect(hinton?.category).toContain('Expand');
    expect(hinton?.points[0]).toContain('ImageNet');
    expect(review).toBeTruthy();
    expect(review?.points[0]).toContain('关键风险');
    expect(insights.some((item) => item.source === '主持人')).toBe(false);
  });

  it('extracts a representative case for the main chat area', () => {
    const bubbles = [
      {
        kind: 'mentor',
        mentorId: 'alice',
        name: 'Alice',
        color: '#2563eb',
        text: '如果只是泛泛比较方向，这一轮不会推进判断。以 ImageNet 之后大量 leaderboard 导向工作为例，真正留下来的研究，往往都解释了表征为什么能迁移，而不只是分数更高。',
        streaming: false,
      },
    ] as BubbleState[];

    const representativeCase = extractRepresentativeCase(bubbles);

    expect(representativeCase).toBeTruthy();
    expect(representativeCase?.source).toBe('Alice');
    expect(representativeCase?.text).toContain('ImageNet');
    expect(representativeCase?.status).toBe('confirmed');
    expect(representativeCase?.rationale).toContain('值得展开');
  });

  it('extracts an inline case from a single text block', () => {
    const inlineCase = extractCaseFromText(
      '如果只是泛泛比较方向，这一轮不会推进判断。以 ImageNet 之后大量 leaderboard 导向工作为例，真正留下来的研究都解释了表征为什么能迁移。',
      'Alice',
      '#2563eb',
      'mentor',
    );

    expect(inlineCase).toBeTruthy();
    expect(inlineCase?.source).toBe('Alice');
    expect(inlineCase?.text).toContain('ImageNet');
    expect(inlineCase?.status).toBe('confirmed');
  });

  it('collects multiple case candidates from the conversation', () => {
    const cases = extractCaseCandidates([
      {
        kind: 'mentor',
        mentorId: 'alice',
        name: 'Alice',
        color: '#2563eb',
        text: '以 ImageNet 之后大量 leaderboard 导向工作为例，真正留下来的研究都解释了表征为什么能迁移。',
        streaming: false,
      },
      {
        kind: 'report',
        text: '反例：如果评估只覆盖训练分布，很多看起来优秀的研究会在真实环境里失败。',
      },
    ] as BubbleState[]);

    expect(cases.length).toBeGreaterThanOrEqual(2);
    expect(cases.some((item) => item.source === 'Alice')).toBe(true);
    expect(cases.some((item) => item.source === 'Deep Review')).toBe(true);
    expect(cases.every((item) => item.status === 'confirmed' || item.status === 'candidate')).toBe(true);
  });

  it('keeps example-heavy research advice as a candidate rather than a confirmed case', () => {
    const inlineCase = extractCaseFromText(
      '我在80年代研究反向传播时，没有先证明它生物合理，而是做小实验。在笔画识别中，隐藏单元学会了检测笔画的朝向，这让我确信分布式表示是真实存在的。',
      '杰弗里·辛顿',
      '#0891B2',
      'mentor',
    );

    expect(inlineCase).toBeTruthy();
    expect(inlineCase?.status).toBe('candidate');
  });

  it('forces explicit case labels into confirmed status', () => {
    const inlineCase = extractCaseFromText(
      '具体case：在笔画识别中，隐藏单元学会了检测笔画的朝向，这说明分布式表示不是空话。',
      '杰弗里·辛顿',
      '#0891B2',
      'mentor',
    );

    expect(inlineCase).toBeTruthy();
    expect(inlineCase?.status).toBe('confirmed');
  });
});
