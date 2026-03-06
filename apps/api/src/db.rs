use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;

pub struct Db {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone)]
pub struct DiagramRow {
    pub id: String,
    pub title: Option<String>,
    pub data: String,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: String,
}

impl Db {
    pub fn open(path: &str) -> Self {
        let conn = Connection::open(path).expect("Failed to open database");
        conn.execute_batch("PRAGMA journal_mode = WAL;").unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS diagrams (
                id         TEXT PRIMARY KEY,
                title      TEXT,
                data       TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_diagrams_expires_at ON diagrams(expires_at);",
        )
        .unwrap();
        Self {
            conn: Mutex::new(conn),
        }
    }

    pub fn insert(&self, row: &DiagramRow) {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO diagrams (id, title, data, created_at, updated_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![row.id, row.title, row.data, row.created_at, row.updated_at, row.expires_at],
        )
        .unwrap();
    }

    pub fn get(&self, id: &str) -> Option<DiagramRow> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, title, data, created_at, updated_at, expires_at FROM diagrams WHERE id = ?1",
            params![id],
            |row| {
                Ok(DiagramRow {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    data: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    expires_at: row.get(5)?,
                })
            },
        )
        .optional()
        .unwrap()
    }

    pub fn update(&self, id: &str, title: Option<&str>, data: &str, updated_at: &str, expires_at: &str) -> bool {
        let conn = self.conn.lock().unwrap();
        let changes = if let Some(t) = title {
            conn.execute(
                "UPDATE diagrams SET title = ?1, data = ?2, updated_at = ?3, expires_at = ?4 WHERE id = ?5",
                params![t, data, updated_at, expires_at, id],
            )
            .unwrap()
        } else {
            conn.execute(
                "UPDATE diagrams SET data = ?1, updated_at = ?2, expires_at = ?3 WHERE id = ?4",
                params![data, updated_at, expires_at, id],
            )
            .unwrap()
        };
        changes > 0
    }

    pub fn touch_ttl(&self, id: &str, updated_at: &str, expires_at: &str) {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE diagrams SET updated_at = ?1, expires_at = ?2 WHERE id = ?3",
            params![updated_at, expires_at, id],
        )
        .unwrap();
    }

    pub fn delete(&self, id: &str) -> bool {
        let conn = self.conn.lock().unwrap();
        let changes = conn
            .execute("DELETE FROM diagrams WHERE id = ?1", params![id])
            .unwrap();
        changes > 0
    }
}
