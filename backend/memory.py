import json
import sqlite3
from uuid import uuid4

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations(
  id TEXT PRIMARY KEY, title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages(
  id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, mentor_id TEXT,
  mode TEXT DEFAULT 'chat', content TEXT, is_silent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS review_reports(
  id TEXT PRIMARY KEY, conversation_id TEXT, markdown TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS long_term_memory(
  id TEXT PRIMARY KEY, kind TEXT, content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS branches(
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  parent_branch_id TEXT,
  forked_from_message_id TEXT,
  title TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_branches_conversation_id
  ON branches(conversation_id);
CREATE INDEX IF NOT EXISTS idx_branches_parent_branch_id
  ON branches(parent_branch_id);
CREATE TABLE IF NOT EXISTS branch_state(
  branch_id TEXT PRIMARY KEY,
  intent_summary TEXT DEFAULT '',
  domain_scope TEXT DEFAULT '',
  open_questions TEXT DEFAULT '[]',
  resolved_constraints TEXT DEFAULT '[]',
  current_stage TEXT DEFAULT 'explore',
  last_router_action TEXT DEFAULT '',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""

DEFAULT_BRANCH_STATE = {
    "intent_summary": "",
    "domain_scope": "",
    "open_questions": [],
    "resolved_constraints": [],
    "current_stage": "explore",
    "last_router_action": "",
}


class Store:
    def __init__(self, db_path: str):
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)
        self._migrate()

    def _migrate(self) -> None:
        cols = {
            row["name"]
            for row in self._conn.execute("PRAGMA table_info(messages)").fetchall()
        }
        if "branch_id" not in cols:
            self._conn.execute("ALTER TABLE messages ADD COLUMN branch_id TEXT")
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_branch_id_created_at "
            "ON messages(branch_id, created_at)"
        )
        self._conn.commit()

    def _id(self) -> str:
        return uuid4().hex

    def create_conversation(self, title: str) -> str:
        cid = self._id()
        self._conn.execute("INSERT INTO conversations(id,title) VALUES(?,?)", (cid, title))
        self._conn.commit()
        self.create_root_branch(cid, title=title)
        return cid

    def list_conversations(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM conversations ORDER BY updated_at DESC").fetchall()
        return [dict(r) for r in rows]

    def get_conversation(self, conversation_id) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM conversations WHERE id=?",
            (conversation_id,)).fetchone()
        return dict(row) if row else None

    def update_conversation_title(self, conversation_id, title: str) -> bool:
        with self._conn:
            cur = self._conn.execute(
                "UPDATE conversations SET title=? WHERE id=?",
                (title, conversation_id))
            if cur.rowcount > 0:
                self._conn.execute(
                    "UPDATE branches SET title=?, updated_at=CURRENT_TIMESTAMP "
                    "WHERE conversation_id=? AND parent_branch_id IS NULL",
                    (title, conversation_id),
                )
        return cur.rowcount > 0

    def create_root_branch(self, conversation_id: str, title: str = "") -> str:
        existing = self._conn.execute(
            "SELECT id FROM branches WHERE conversation_id=? AND parent_branch_id IS NULL "
            "ORDER BY created_at, rowid LIMIT 1",
            (conversation_id,),
        ).fetchone()
        if existing:
            self._ensure_branch_state(existing["id"])
            self._backfill_messages_branch_id(conversation_id, existing["id"])
            return existing["id"]

        bid = self._id()
        self._conn.execute(
            "INSERT INTO branches(id,conversation_id,parent_branch_id,forked_from_message_id,title)"
            " VALUES(?,?,?,?,?)",
            (bid, conversation_id, None, None, title or "Main"),
        )
        self._conn.commit()
        self._ensure_branch_state(bid)
        self._backfill_messages_branch_id(conversation_id, bid)
        return bid

    def ensure_branch_for_conversation(self, conversation_id: str) -> str:
        return self.create_root_branch(conversation_id)

    def list_branches(self, conversation_id: str) -> list[dict]:
        self.ensure_branch_for_conversation(conversation_id)
        rows = self._conn.execute(
            "SELECT * FROM branches WHERE conversation_id=? ORDER BY created_at, rowid",
            (conversation_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_branch(self, branch_id: str) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM branches WHERE id=?",
            (branch_id,),
        ).fetchone()
        return dict(row) if row else None

    def create_branch(
        self,
        conversation_id: str,
        parent_branch_id: str | None,
        forked_from_message_id: str | None,
        title: str,
    ) -> str:
        self.ensure_branch_for_conversation(conversation_id)
        bid = self._id()
        self._conn.execute(
            "INSERT INTO branches("
            "id,conversation_id,parent_branch_id,forked_from_message_id,title"
            ") VALUES(?,?,?,?,?)",
            (bid, conversation_id, parent_branch_id, forked_from_message_id, title or "Fork"),
        )
        self._conn.commit()
        self._ensure_branch_state(bid)
        return bid

    def touch_branch(self, branch_id: str) -> None:
        branch = self.get_branch(branch_id)
        if branch is None:
            return
        self._conn.execute(
            "UPDATE branches SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (branch_id,),
        )
        self._conn.execute(
            "UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (branch["conversation_id"],),
        )
        self._conn.commit()

    def update_branch_state(
        self,
        branch_id: str,
        *,
        intent_summary: str | None = None,
        domain_scope: str | None = None,
        open_questions: list[str] | None = None,
        resolved_constraints: list[str] | None = None,
        current_stage: str | None = None,
        last_router_action: str | None = None,
    ) -> None:
        self._ensure_branch_state(branch_id)
        current = self.get_branch_state(branch_id)
        payload = {
            "intent_summary": intent_summary if intent_summary is not None else current["intent_summary"],
            "domain_scope": domain_scope if domain_scope is not None else current["domain_scope"],
            "open_questions": open_questions if open_questions is not None else current["open_questions"],
            "resolved_constraints": (
                resolved_constraints
                if resolved_constraints is not None
                else current["resolved_constraints"]
            ),
            "current_stage": current_stage if current_stage is not None else current["current_stage"],
            "last_router_action": (
                last_router_action
                if last_router_action is not None
                else current["last_router_action"]
            ),
        }
        self._conn.execute(
            "UPDATE branch_state SET "
            "intent_summary=?, domain_scope=?, open_questions=?, resolved_constraints=?, "
            "current_stage=?, last_router_action=?, updated_at=CURRENT_TIMESTAMP "
            "WHERE branch_id=?",
            (
                payload["intent_summary"],
                payload["domain_scope"],
                json.dumps(payload["open_questions"], ensure_ascii=False),
                json.dumps(payload["resolved_constraints"], ensure_ascii=False),
                payload["current_stage"],
                payload["last_router_action"],
                branch_id,
            ),
        )
        self._conn.commit()

    def get_branch_state(self, branch_id: str) -> dict:
        self._ensure_branch_state(branch_id)
        row = self._conn.execute(
            "SELECT * FROM branch_state WHERE branch_id=?",
            (branch_id,),
        ).fetchone()
        if row is None:
            payload = {"branch_id": branch_id, **DEFAULT_BRANCH_STATE, "updated_at": ""}
            return payload
        data = dict(row)
        data["open_questions"] = self._json_loads(data.get("open_questions"), [])
        data["resolved_constraints"] = self._json_loads(data.get("resolved_constraints"), [])
        return data

    def add_message(
        self,
        conversation_id,
        role,
        content,
        mentor_id=None,
        mode="chat",
        is_silent=False,
        branch_id: str | None = None,
    ) -> str:
        branch_id = branch_id or self.ensure_branch_for_conversation(conversation_id)
        mid = self._id()
        self._conn.execute(
            "INSERT INTO messages("
            "id,conversation_id,branch_id,role,mentor_id,mode,content,is_silent"
            ") VALUES(?,?,?,?,?,?,?,?)",
            (mid, conversation_id, branch_id, role, mentor_id, mode, content, int(is_silent)),
        )
        self._conn.execute(
            "UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (conversation_id,))
        self._conn.execute(
            "UPDATE branches SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (branch_id,),
        )
        self._conn.commit()
        return mid

    def get_messages(self, conversation_id, branch_id: str | None = None) -> list[dict]:
        if branch_id is not None:
            return self.get_branch_messages(branch_id)
        root_branch_id = self.ensure_branch_for_conversation(conversation_id)
        return self.get_branch_messages(root_branch_id)

    def get_branch_messages(self, branch_id: str) -> list[dict]:
        branch = self.get_branch(branch_id)
        if branch is None:
            return []
        self._backfill_messages_branch_id(branch["conversation_id"], branch_id)
        rows = self._conn.execute(
            "SELECT * FROM messages WHERE branch_id=? ORDER BY created_at, rowid",
            (branch_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_branch_messages_until(self, branch_id: str, message_id: str | None) -> list[dict]:
        if not message_id:
            return []
        branch = self.get_branch(branch_id)
        if branch is None:
            return []
        self._backfill_messages_branch_id(branch["conversation_id"], branch_id)
        target = self._conn.execute(
            "SELECT rowid, created_at FROM messages WHERE id=? AND branch_id=?",
            (message_id, branch_id),
        ).fetchone()
        if target is None:
            return []
        rows = self._conn.execute(
            "SELECT * FROM messages WHERE branch_id=? "
            "AND (created_at < ? OR (created_at=? AND rowid <= ?)) "
            "ORDER BY created_at, rowid",
            (branch_id, target["created_at"], target["created_at"], target["rowid"]),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_branch_lineage(self, branch_id: str) -> list[dict]:
        lineage = []
        seen = set()
        current = self.get_branch(branch_id)
        while current is not None and current["id"] not in seen:
            lineage.append(current)
            seen.add(current["id"])
            parent_id = current.get("parent_branch_id")
            current = self.get_branch(parent_id) if parent_id else None
        return list(reversed(lineage))

    def delete_conversation(self, conversation_id) -> bool:
        with self._conn:
            branch_rows = self._conn.execute(
                "SELECT id FROM branches WHERE conversation_id=?",
                (conversation_id,),
            ).fetchall()
            for row in branch_rows:
                self._conn.execute("DELETE FROM branch_state WHERE branch_id=?", (row["id"],))
            self._conn.execute(
                "DELETE FROM branches WHERE conversation_id=?",
                (conversation_id,),
            )
            self._conn.execute(
                "DELETE FROM messages WHERE conversation_id=?",
                (conversation_id,))
            self._conn.execute(
                "DELETE FROM review_reports WHERE conversation_id=?",
                (conversation_id,))
            cur = self._conn.execute(
                "DELETE FROM conversations WHERE id=?",
                (conversation_id,))
        return cur.rowcount > 0

    def save_report(self, conversation_id, markdown) -> str:
        rid = self._id()
        self._conn.execute(
            "INSERT INTO review_reports(id,conversation_id,markdown) VALUES(?,?,?)",
            (rid, conversation_id, markdown))
        self._conn.commit()
        return rid

    def get_reports(self, conversation_id) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM review_reports WHERE conversation_id=? ORDER BY created_at, rowid",
            (conversation_id,)).fetchall()
        return [dict(r) for r in rows]

    def add_long_term(self, kind, content):
        self._conn.execute(
            "INSERT INTO long_term_memory(id,kind,content) VALUES(?,?,?)",
            (self._id(), kind, content))
        self._conn.commit()

    def get_long_term(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM long_term_memory ORDER BY created_at").fetchall()
        return [dict(r) for r in rows]

    def _ensure_branch_state(self, branch_id: str) -> None:
        row = self._conn.execute(
            "SELECT 1 FROM branch_state WHERE branch_id=?",
            (branch_id,),
        ).fetchone()
        if row:
            return
        self._conn.execute(
            "INSERT INTO branch_state("
            "branch_id,intent_summary,domain_scope,open_questions,resolved_constraints,"
            "current_stage,last_router_action"
            ") VALUES(?,?,?,?,?,?,?)",
            (
                branch_id,
                DEFAULT_BRANCH_STATE["intent_summary"],
                DEFAULT_BRANCH_STATE["domain_scope"],
                json.dumps(DEFAULT_BRANCH_STATE["open_questions"], ensure_ascii=False),
                json.dumps(DEFAULT_BRANCH_STATE["resolved_constraints"], ensure_ascii=False),
                DEFAULT_BRANCH_STATE["current_stage"],
                DEFAULT_BRANCH_STATE["last_router_action"],
            ),
        )
        self._conn.commit()

    def _backfill_messages_branch_id(self, conversation_id: str, branch_id: str) -> None:
        self._conn.execute(
            "UPDATE messages SET branch_id=? WHERE conversation_id=? AND branch_id IS NULL",
            (branch_id, conversation_id),
        )
        self._conn.commit()

    @staticmethod
    def _json_loads(raw, fallback):
        if not raw:
            return fallback
        try:
            return json.loads(raw)
        except Exception:
            return fallback
