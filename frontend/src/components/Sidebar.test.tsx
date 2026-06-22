// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

const conversations = [{
  id: 'abc',
  title: 'Chat',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}];

describe('Sidebar actions', () => {
  it('exposes delete and export controls per conversation', () => {
    const onDelete = vi.fn();
    const onExport = vi.fn();
    const { getByLabelText } = render(
      <Sidebar
        conversations={conversations}
        activeId="abc"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={onDelete}
        onExport={onExport}
        actionsDisabled={false}
      />,
    );

    fireEvent.click(getByLabelText('Delete Chat'));
    fireEvent.click(getByLabelText('Export Chat as Markdown'));
    fireEvent.click(getByLabelText('Export Chat as PDF'));

    expect(onDelete).toHaveBeenCalledWith('abc');
    expect(onExport).toHaveBeenCalledWith('abc', 'md');
    expect(onExport).toHaveBeenCalledWith('abc', 'pdf');
  });
});
