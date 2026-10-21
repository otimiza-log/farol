// Banco SQLite: usa o módulo embutido do Node (node:sqlite, Node 22.13+) e, se não houver, o pacote better-sqlite3.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  apelido TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  email TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  patente INTEGER NOT NULL DEFAULT 0,
  modo_serio INTEGER NOT NULL DEFAULT 0,
  prova_aprovada INTEGER NOT NULL DEFAULT 0,
  aceite_em TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS missoes_usuario (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  missao TEXT NOT NULL,
  concluida INTEGER NOT NULL DEFAULT 0,
  melhor_pontos INTEGER NOT NULL DEFAULT 0,
  melhor_opcionais INTEGER NOT NULL DEFAULT 0,
  melhor_tempo INTEGER NOT NULL DEFAULT 0,
  tentativas INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, missao)
);
CREATE TABLE IF NOT EXISTS corridas (
  id TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  missao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa',
  iniciada_em TEXT NOT NULL,
  concluida_em TEXT,
  pontos INTEGER,
  xp INTEGER
);
CREATE INDEX IF NOT EXISTS corridas_usuario ON corridas(usuario_id, iniciada_em);
CREATE TABLE IF NOT EXISTS corrida_eventos (
  corrida_id TEXT NOT NULL REFERENCES corridas(id) ON DELETE CASCADE,
  evento TEXT NOT NULL,
  linha TEXT NOT NULL,
  pontos INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  em TEXT NOT NULL,
  PRIMARY KEY (corrida_id, evento)
);
CREATE TABLE IF NOT EXISTS corrida_perguntas (
  corrida_id TEXT NOT NULL REFERENCES corridas(id) ON DELETE CASCADE,
  pergunta_id TEXT NOT NULL,
  versao INTEGER NOT NULL,
  altar TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  resposta INTEGER,
  ok INTEGER,
  pontos INTEGER,
  respondida_em TEXT,
  PRIMARY KEY (corrida_id, pergunta_id)
);
CREATE TABLE IF NOT EXISTS provas (
  id TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perguntas TEXT NOT NULL,
  iniciada_em TEXT NOT NULL,
  enviada_em TEXT,
  respostas TEXT,
  acertos INTEGER,
  total INTEGER,
  nota REAL,
  aprovada INTEGER
);
CREATE INDEX IF NOT EXISTS provas_usuario ON provas(usuario_id, iniciada_em);
CREATE TABLE IF NOT EXISTS codigos_redefinicao (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash TEXT NOT NULL,
  expira_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER,
  tipo TEXT NOT NULL,
  dados TEXT,
  ip TEXT,
  em TEXT NOT NULL
);
`;

export async function abrirBanco(arquivo) {
  if (arquivo !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(arquivo)), { recursive: true });
  let bruto, motor;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    bruto = new DatabaseSync(arquivo);
    motor = "node:sqlite";
  } catch (e) {
    const require = createRequire(import.meta.url);
    const Better = require("better-sqlite3");
    bruto = new Better(arquivo);
    motor = "better-sqlite3";
  }
  const cache = new Map();
  const prep = (sql) => { let st = cache.get(sql); if (!st) { st = bruto.prepare(sql); cache.set(sql, st); } return st; };
  const db = {
    motor,
    exec: (sql) => bruto.exec(sql),
    run: (sql, ...p) => prep(sql).run(...p),
    get: (sql, ...p) => prep(sql).get(...p),
    all: (sql, ...p) => prep(sql).all(...p),
    tx(fn) {
      bruto.exec("BEGIN IMMEDIATE");
      try { const r = fn(); bruto.exec("COMMIT"); return r; }
      catch (e) { try { bruto.exec("ROLLBACK"); } catch (e2) { /* já desfeito */ } throw e; }
    },
    fechar: () => bruto.close()
  };
  if (arquivo !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  db.exec(ESQUEMA);
  return db;
}
