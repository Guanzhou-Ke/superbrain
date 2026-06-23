import { describe, expect, it, vi } from 'vitest';
import { createBranch, getBranchMessages, listBranches, streamChat } from './api';

function makeStreamResponse(chunks: string[]) {
  let index = 0;
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }
            return { done: false, value: encoder.encode(chunks[index++]) };
          },
        };
      },
    },
  };
}

describe('streamChat', () => {
  it('parses CRLF-delimited SSE progress events in order', async () => {
    const events: Array<{ type: string; message?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async () => makeStreamResponse([
      'data: {"type":"progress","status":"routing","message":"读取长期记忆"}\r\n\r\n',
      'data: {"type":"progress","status":"routing","message":"判断当前思考阶段"}\r\n\r\n',
      'data: {"type":"progress","status":"routing","message":"分析问题并编排导师"}\r\n\r\n',
    ]) as Response));

    await streamChat(
      { conversation_id: 'c1', content: 'hi', mode: 'chat' },
      (event) => events.push({ type: event.type as string, message: event.message as string | undefined }),
    );

    expect(events.map((event) => event.message)).toEqual([
      '读取长期记忆',
      '判断当前思考阶段',
      '分析问题并编排导师',
    ]);
  });
});

describe('branch api helpers', () => {
  it('requests branch endpoints with expected paths', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/branches') && !url.includes('/messages')) {
        return { json: async () => [{ id: 'b1' }] };
      }
      return { json: async () => [{ id: 'm1' }] };
    });
    vi.stubGlobal('fetch', fetchMock);

    await listBranches('c1');
    await createBranch('c1', { parent_branch_id: 'b0', forked_from_message_id: 'm0', title: 'Fork 1' });
    await getBranchMessages('b1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/conversations/c1/branches');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/conversations/c1/branches',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/branches/b1/messages');
  });
});
