-- Una tabla genérica: cada tarea, nota, hábito o día editado es una fila con su JSON.
-- user_email viene de Cloudflare Access, así cada persona solo ve lo suyo.
CREATE TABLE IF NOT EXISTS items (
  user_email TEXT NOT NULL,
  tabla TEXT NOT NULL CHECK (tabla IN ('tareas','notas','habitos','dias')),
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_email, tabla, id)
);
