// API layer for SuperBrain frontend

export interface Mentor {
  id: string;
  name: string;
  title: string;
  expertise: string[];
  belief: string;
  color: string;
  model: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  mentor_id: string | null;
  mode: string;
  is_silent: number;
  created_at: string;
}

export interface ChatEvent {
  type: string;
  [k: string]: unknown;
}

export async function streamChat(
  body: { conversation_id: string | null; content: string; mode: string },
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.split("\n").find((l) => l.startsWith("data:"));
      if (line) {
        try {
          onEvent(JSON.parse(line.slice(5).trim()));
        } catch {
          // ignore malformed SSE data
        }
      }
    }
  }

  // flush remaining buffer
  if (buf.trim()) {
    const line = buf.split("\n").find((l) => l.startsWith("data:"));
    if (line) {
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        // ignore
      }
    }
  }
}

export const listMentors = (): Promise<Mentor[]> =>
  fetch("/api/mentors").then((r) => r.json());

export const listConversations = (): Promise<Conversation[]> =>
  fetch("/api/conversations").then((r) => r.json());

export const createConversation = (title: string): Promise<{ id: string }> =>
  fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }).then((r) => r.json());

export const getMessages = (cid: string): Promise<Message[]> =>
  fetch(`/api/conversations/${cid}/messages`).then((r) => r.json());

export async function deleteConversation(cid: string): Promise<void> {
  const resp = await fetch(`/api/conversations/${cid}`, { method: "DELETE" });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  }
}

export type ExportFormat = "md" | "pdf";

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="?(?<filename>[^";]+)"?/);
  return match?.groups?.filename || fallback;
}

export async function exportConversation(
  cid: string,
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  const resp = await fetch(`/api/conversations/${cid}/export?format=${format}`);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  }

  const blob = await resp.blob();
  const contentType = resp.headers.get("content-type") || blob.type;
  return {
    blob: contentType ? blob.slice(0, blob.size, contentType) : blob,
    filename: filenameFromContentDisposition(
      resp.headers.get("content-disposition"),
      `conversation.${format}`,
    ),
  };
}
