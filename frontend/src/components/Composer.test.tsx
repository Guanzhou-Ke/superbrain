// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

describe('Composer', () => {
  it('applies the suggested next stage when clicked', () => {
    const onModeChange = vi.fn();

    const { getByText } = render(
      <Composer
        mode="explore"
        onModeChange={onModeChange}
        onSend={vi.fn()}
        disabled={false}
        suggestion={{
          fromStage: 'explore',
          toStage: 'clarify',
          reason: '你已经开始比较方向，下一轮更适合进入澄清阶段。',
        }}
      />,
    );

    fireEvent.click(getByText('Switch to Clarify'));

    expect(onModeChange).toHaveBeenCalledWith('clarify');
  });

  it('loads an injected draft into the textarea', () => {
    const { getByDisplayValue } = render(
      <Composer
        mode="plan"
        onModeChange={vi.fn()}
        onSend={vi.fn()}
        disabled={false}
        suggestion={null}
        draftText={'请把这个 case 转成实验问题'}
      />,
    );

    expect(getByDisplayValue('请把这个 case 转成实验问题')).toBeTruthy();
  });
});
