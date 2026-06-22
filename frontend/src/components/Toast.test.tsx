// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders a notification and can be dismissed', () => {
    const onDismiss = vi.fn();

    const { getByText, getByLabelText } = render(
      <Toast message="已保存到长期记忆：回答要简洁" onDismiss={onDismiss} />,
    );

    expect(getByText('已保存到长期记忆：回答要简洁')).toBeTruthy();
    fireEvent.click(getByLabelText('Dismiss notification'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
