// Ferramenta do administrador (rodar na VPS):
//   node servidor/admin.mjs codigo <apelido>     gera um código de redefinição de senha (vale 24 h)
//   node servidor/admin.mjs usuarios             lista os jogadores
//   node servidor/admin.mjs backup <arquivo.db>  cópia consistente do banco
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirBanco } from "./banco.mjs";
import { carregarCatalogo } from "./catalogo.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = await abrirBanco(process.env.FAROL_DB || path.join(RAIZ, "servidor", "dados", "farol.db"));
const [cmd, arg] = process.argv.slice(2);
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

if (cmd === "codigo" && arg) {
  const u = db.get("SELECT id, apelido FROM usuarios WHERE apelido = ?", arg);
  if (!u) { console.error(`Jogador "${arg}" não encontrado.`); process.exit(1); }
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codigo = Array.from({ length: 8 }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join("");
  db.run("DELETE FROM codigos_redefinicao WHERE usuario_id = ?", u.id);
  db.run("INSERT INTO codigos_redefinicao (usuario_id, codigo_hash, expira_em) VALUES (?, ?, ?)", u.id, sha256(codigo), new Date(Date.now() + 24 * 3600e3).toISOString());
  db.run("INSERT INTO auditoria (usuario_id, tipo, em) VALUES (?, 'codigo_redefinicao', ?)", u.id, new Date().toISOString());
  console.log(`Código para ${u.apelido}: ${codigo}  (vale 24 h; o jogador usa em "Esqueci a senha")`);
} else if (cmd === "usuarios") {
  const { PATENTES } = carregarCatalogo(RAIZ);
  const linhas = db.all("SELECT apelido, xp, patente, criado_em FROM usuarios ORDER BY criado_em");
  linhas.forEach((u) => console.log(`${u.apelido.padEnd(18)} ${String(u.xp).padStart(6)} XP  ${PATENTES[u.patente].nome.padEnd(26)} desde ${u.criado_em.slice(0, 10)}`));
  console.log(`${linhas.length} jogador(es).`);
} else if (cmd === "backup" && arg) {
  db.exec(`VACUUM INTO '${arg.replace(/'/g, "''")}'`);
  console.log(`Backup salvo em ${arg}`);
} else {
  console.log("Uso: node servidor/admin.mjs codigo <apelido> | usuarios | backup <arquivo.db>");
  process.exit(1);
}
db.fechar();
