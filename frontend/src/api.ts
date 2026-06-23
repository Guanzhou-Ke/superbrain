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

export interface Branch {
  id: string;
  conversation_id: string;
  parent_branch_id: string | null;
  forked_from_message_id: string | null;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  branch_id?: string | null;
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
  body: { conversation_id: string | null; branch_id?: string | null; content: string; mode: string },
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
    const parsed = parseSseBuffer(buf, onEvent);
    buf = parsed.remaining;
  }

  // flush remaining buffer
  if (buf.trim()) {
    parseSseEvent(buf, onEvent);
  }
}

function parseSseBuffer(
  buffer: string,
  onEvent: (e: ChatEvent) => void,
): { remaining: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const remaining = parts.pop() ?? "";

  for (const part of parts) {
    parseSseEvent(part, onEvent);
  }

  return { remaining };
}

function parseSseEvent(
  rawEvent: string,
  onEvent: (e: ChatEvent) => void,
) {
  const dataLines = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  if (dataLines.length === 0) return;

  try {
    onEvent(JSON.parse(dataLines.join("\n")));
  } catch {
    // ignore malformed SSE data
  }
}

export const listMentors = (): Promise<Mentor[]> =>
  fetch("/api/mentors").then((r) => r.json());

export const listConversations = (): Promise<Conversation[]> =>
  fetch("/api/conversations").then((r) => r.json());

export const createConversation = (title: string): Promise<{ id: string; root_branch_id: string }> =>
  fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }).then((r) => r.json());

export const getMessages = (cid: string): Promise<Message[]> =>
  fetch(`/api/conversations/${cid}/messages`).then((r) => r.json());

export const listBranches = (cid: string): Promise<Branch[]> =>
  fetch(`/api/conversations/${cid}/branches`).then((r) => r.json());

export const createBranch = (
  cid: string,
  body: { parent_branch_id?: string | null; forked_from_message_id?: string | null; title?: string },
): Promise<{ id: string }> =>
  fetch(`/api/conversations/${cid}/branches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const getBranchMessages = (bid: string): Promise<Message[]> =>
  fetch(`/api/branches/${bid}/messages`).then((r) => r.json());

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
