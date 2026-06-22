import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteConversation, exportConversation } from './api';

describe('conversation API actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes a conversation with DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteConversation('abc123');

    expect(fetchMock).toHaveBeenCalledWith('/api/conversations/abc123', {
      method: 'DELETE',
    });
  });

  it('throws when deleting a conversation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404 })));

    await expect(deleteConversation('missing')).rejects.toThrow('HTTP 404');
  });

  it('exports a conversation and keeps the server filename', async () => {
    const blob = new Blob(['# hello'], { type: 'text/markdown' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(blob, {
      status: 200,
      headers: {
        'Content-Disposition': 'attachment; filename="my-chat.md"',
      },
    })));

    const result = await exportConversation('abc123', 'md');

    expect(result.filename).toBe('my-chat.md');
    expect(result.blob.type).toBe('text/markdown');
  });
});
