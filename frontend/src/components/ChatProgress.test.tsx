// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatProgress } from './ChatProgress';

describe('ChatProgress', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows routing as a compact status capsule', () => {
    const { getByRole, getByText, queryByTitle } = render(<ChatProgress status="routing" />);

    expect(getByRole('status')).toBeTruthy();
    expect(getByText('正在思考')).toBeTruthy();
    expect(getByText('理解问题并编排专家视角')).toBeTruthy();
    expect(queryByTitle('编排专家视角')).toBeNull();
  });

  it('shows streamed progress details from the backend', () => {
    const { getByText } = render(<ChatProgress status="routing" detail="已邀请 Alice、Bob 发言" />);

    expect(getByText('正在思考')).toBeTruthy();
    expect(getByText('已邀请 Alice、Bob 发言')).toBeTruthy();
  });

  it('shows synthesis as a compact status capsule', () => {
    const { getByRole, getByText, queryByTitle } = render(<ChatProgress status="synthesizing" />);

    expect(getByRole('status')).toBeTruthy();
    expect(getByText('正在汇总结论')).toBeTruthy();
    expect(queryByTitle('汇总结论')).toBeNull();
  });

  it('renders nothing while idle', () => {
    const { container } = render(<ChatProgress status="idle" />);

    expect(container.firstChild).toBeNull();
  });
});
