-- Quita la restricción de nombres de tabla (la valida el Worker) para poder añadir "carpetas"
CREATE TABLE items_new (
  user_email TEXT NOT NULL,
  tabla TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_email, tabla, id)
);
INSERT INTO items_new SELECT user_email, tabla, id, data, updated_at FROM items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
