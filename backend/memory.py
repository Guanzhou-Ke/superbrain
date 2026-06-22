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
"""


class Store:
    def __init__(self, db_path: str):
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)

    def _id(self) -> str:
        return uuid4().hex

    def create_conversation(self, title: str) -> str:
        cid = self._id()
        self._conn.execute("INSERT INTO conversations(id,title) VALUES(?,?)", (cid, title))
        self._conn.commit()
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
        cur = self._conn.execute(
            "UPDATE conversations SET title=? WHERE id=?",
            (title, conversation_id))
        self._conn.commit()
        return cur.rowcount > 0

    def add_message(self, conversation_id, role, content, mentor_id=None,
                    mode="chat", is_silent=False) -> str:
        mid = self._id()
        self._conn.execute(
            "INSERT INTO messages(id,conversation_id,role,mentor_id,mode,content,is_silent)"
            " VALUES(?,?,?,?,?,?,?)",
            (mid, conversation_id, role, mentor_id, mode, content, int(is_silent)))
        self._conn.execute(
            "UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (conversation_id,))
        self._conn.commit()
        return mid

    def get_messages(self, conversation_id) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at, rowid",
            (conversation_id,)).fetchall()
        return [dict(r) for r in rows]

    def delete_conversation(self, conversation_id) -> bool:
        with self._conn:
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
