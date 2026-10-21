// API do Farol da Liberdade: contas, sessões, partidas validadas no servidor, quiz, ranking e prova final.
// Sem frameworks: node:http + SQLite. Uso: node servidor/app.mjs  (variáveis: PORT, HOST, FAROL_DB, FAROL_ESTATICO)
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirBanco } from "./banco.mjs";
import { carregarCatalogo, altaresDe } from "./catalogo.mjs";
import { sortearPerguntas, montarProva, patenteIndex, pontosDaPergunta, avaliarEvento, validarApelido } from "./regras.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSAO = "1.0.0";
const MIN_SEGUNDOS_MISSAO = Number(process.env.FAROL_MIN_SEGUNDOS ?? 15); // menos que isso não é uma partida plausível
const VALIDADE_CORRIDA_H = 6;             // partida aberta por mais tempo expira
const VALIDADE_PROVA_H = 2;
const SESSAO_DIAS = 30;
const LIMITE_CORPO = 64 * 1024;

const agora = () => new Date().toISOString();
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/* ---------------- senhas (scrypt) ---------------- */
function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${sal.toString("base64")}$${h.toString("base64")}`;
}
function conferirSenha(senha, guardada) {
  const [alg, N, r, p, sal, hash] = String(guardada).split("$");
  if (alg !== "scrypt") return false;
  const esperado = Buffer.from(hash, "base64");
  const h = crypto.scryptSync(senha, Buffer.from(sal, "base64"), esperado.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(h, esperado);
}

/* ---------------- limite de tentativas (memória) ---------------- */
const baldes = new Map();
function limitar(chave, max, janelaMs) {
  const t = Date.now();
  const b = baldes.get(chave);
  if (!b || t > b.reinicia) { baldes.set(chave, { n: 1, reinicia: t + janelaMs }); return true; }
  b.n += 1;
  return b.n <= max;
}
setInterval(() => { const t = Date.now(); for (const [k, b] of baldes) if (t > b.reinicia) baldes.delete(k); }, 60_000).unref();

class Erro extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

export async function criarApp({ arquivoBanco = process.env.FAROL_DB || path.join(RAIZ, "servidor", "dados", "farol.db"), servirEstatico = process.env.FAROL_ESTATICO === "1" } = {}) {
  const db = await abrirBanco(arquivoBanco);
  const CAT = carregarCatalogo(RAIZ);
  const { PARAMS, PATENTES, CAMPANHA, FASES } = CAT;

  const auditar = (usuarioId, tipo, dados, ip) => db.run("INSERT INTO auditoria (usuario_id, tipo, dados, ip, em) VALUES (?, ?, ?, ?, ?)", usuarioId ?? null, tipo, dados ? JSON.stringify(dados) : null, ip || null, agora());

  /* ---------------- perfil no formato que o jogo já usa ---------------- */
  function concluidasDe(uid) { return new Set(db.all("SELECT missao FROM missoes_usuario WHERE usuario_id = ? AND concluida = 1", uid).map((r) => r.missao)); }
  function recalcularPatente(uid) {
    const u = db.get("SELECT xp, prova_aprovada FROM usuarios WHERE id = ?", uid);
    const idx = patenteIndex(PATENTES, u.xp, concluidasDe(uid), !!u.prova_aprovada);
    db.run("UPDATE usuarios SET patente = ? WHERE id = ?", idx, uid);
    return idx;
  }
  function perfilDe(uid) {
    const u = db.get("SELECT id, apelido, xp, patente, modo_serio, prova_aprovada FROM usuarios WHERE id = ?", uid);
    const missoes = {};
    for (const m of db.all("SELECT * FROM missoes_usuario WHERE usuario_id = ?", uid)) {
      missoes[m.missao] = {
        concluida: !!m.concluida, tentativas: m.tentativas,
        melhor: m.missao === "final" || !m.concluida ? null : { pontos: m.melhor_pontos, opcionais: m.melhor_opcionais, tempo: m.melhor_tempo }
      };
    }
    const tentativas = db.all("SELECT enviada_em, acertos, total, nota, aprovada FROM provas WHERE usuario_id = ? AND enviada_em IS NOT NULL ORDER BY enviada_em", uid)
      .map((p) => ({ em: p.enviada_em, acertos: p.acertos, total: p.total, nota: p.nota, aprovado: !!p.aprovada }));
    return {
      id: String(u.id), apelido: u.apelido, xp: u.xp, patente: u.patente, modoSerio: !!u.modo_serio,
      provaAprovada: !!u.prova_aprovada, missoes, prova: { tentativas, aprovada: !!u.prova_aprovada }, tentativasQuiz: []
    };
  }

  /* ---------------- sessões ---------------- */
  function criarSessao(res, req, uid) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expira = new Date(Date.now() + SESSAO_DIAS * 864e5);
    db.run("INSERT INTO sessoes (token_hash, usuario_id, criado_em, expira_em) VALUES (?, ?, ?, ?)", sha256(token), uid, agora(), expira.toISOString());
    const seguro = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "; Secure" : "";
    res.setHeader("Set-Cookie", `farol_sessao=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSAO_DIAS * 86400}${seguro}`);
  }
  function limparCookie(res) { res.setHeader("Set-Cookie", "farol_sessao=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"); }
  function usuarioDaSessao(req) {
    const m = /(?:^|;\s*)farol_sessao=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || "");
    if (!m) return null;
    const s = db.get("SELECT usuario_id, expira_em FROM sessoes WHERE token_hash = ?", sha256(m[1]));
    if (!s) return null;
    if (s.expira_em < agora()) { db.run("DELETE FROM sessoes WHERE token_hash = ?", sha256(m[1])); return null; }
    return { id: s.usuario_id, tokenHash: sha256(m[1]) };
  }

  /* ---------------- partidas ---------------- */
  function corridaDo(uid, id) {
    const c = db.get("SELECT * FROM corridas WHERE id = ? AND usuario_id = ?", String(id || ""), uid);
    if (!c) throw new Erro(404, "Partida não encontrada. Comece a missão de novo.");
    if (c.status !== "ativa") throw new Erro(409, "Esta partida já foi encerrada.");
    if (Date.now() - Date.parse(c.iniciada_em) > VALIDADE_CORRIDA_H * 3600e3) throw new Erro(409, "Esta partida expirou. Comece a missão de novo.");
    return c;
  }
  function registrarEvento(c, evento) {
    const F = FASES[c.missao];
    const av = avaliarEvento(PARAMS, F, String(evento));
    if (!av) return false;
    let pontos = av.pontos;
    if (av.linha === "inimigos") {
      const ganhos = db.get("SELECT COALESCE(SUM(pontos), 0) s FROM corrida_eventos WHERE corrida_id = ? AND linha = 'inimigos'", c.id).s;
      if (ganhos + pontos > PARAMS.tetoInimigos) pontos = 0;
    }
    db.run("INSERT OR IGNORE INTO corrida_eventos (corrida_id, evento, linha, pontos, xp, em) VALUES (?, ?, ?, ?, ?, ?)", c.id, String(evento), av.linha, pontos, av.xp, agora());
    return true;
  }
  const semResposta = (q) => ({ id: q.id, tema: q.tema, nivel: q.nivel, pergunta: q.pergunta, alternativas: q.alternativas });

  /* ---------------- rotas ---------------- */
  const rotas = {
    "GET /api/saude": () => ({ ok: true, versao: VERSAO, banco: db.motor, perguntas: CAT.perguntas.size }),

    "POST /api/cadastro": ({ corpo, res, req, ip }) => {
      if (!limitar("conta:" + ip, 10, 10 * 60e3)) throw new Erro(429, "Muitas tentativas. Aguarde alguns minutos.");
      const apelido = String(corpo.apelido || "").trim();
      const erroAp = validarApelido(apelido); if (erroAp) throw new Erro(400, erroAp);
      const senha = String(corpo.senha || "");
      if (senha.length < 8 || senha.length > 128) throw new Erro(400, "A senha deve ter de 8 a 128 caracteres.");
      const email = corpo.email ? String(corpo.email).trim().slice(0, 120) : null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Erro(400, "E-mail inválido. Deixe em branco se preferir.");
      if (corpo.aceite !== true) throw new Erro(400, "É preciso aceitar a política de privacidade para criar a conta.");
      if (db.get("SELECT 1 FROM usuarios WHERE apelido = ?", apelido)) throw new Erro(409, "Esse apelido já está em uso. Escolha outro.");
      const r = db.run("INSERT INTO usuarios (apelido, senha_hash, email, aceite_em, criado_em) VALUES (?, ?, ?, ?, ?)", apelido, hashSenha(senha), email, agora(), agora());
      const uid = Number(r.lastInsertRowid);
      criarSessao(res, req, uid);
      auditar(uid, "cadastro", null, ip);
      return { perfil: perfilDe(uid) };
    },

    "POST /api/login": ({ corpo, res, req, ip }) => {
      const apelido = String(corpo.apelido || "").trim();
      if (!limitar("login:" + ip, 10, 10 * 60e3) || !limitar("login-ap:" + apelido.toLowerCase(), 8, 10 * 60e3)) throw new Erro(429, "Muitas tentativas. Aguarde alguns minutos.");
      const u = db.get("SELECT id, senha_hash FROM usuarios WHERE apelido = ?", apelido);
      if (!u || !conferirSenha(String(corpo.senha || ""), u.senha_hash)) { auditar(u ? u.id : null, "login_falhou", null, ip); throw new Erro(401, "Apelido ou senha incorretos."); }
      criarSessao(res, req, u.id);
      auditar(u.id, "login", null, ip);
      return { perfil: perfilDe(u.id) };
    },

    "POST /api/sair": ({ sessao, res }) => {
      if (sessao) db.run("DELETE FROM sessoes WHERE token_hash = ?", sessao.tokenHash);
      limparCookie(res);
      return { ok: true };
    },

    "POST /api/redefinir": ({ corpo, ip }) => {
      if (!limitar("redef:" + ip, 5, 10 * 60e3)) throw new Erro(429, "Muitas tentativas. Aguarde alguns minutos.");
      const u = db.get("SELECT id FROM usuarios WHERE apelido = ?", String(corpo.apelido || "").trim());
      const nova = String(corpo.novaSenha || "");
      if (nova.length < 8 || nova.length > 128) throw new Erro(400, "A nova senha deve ter de 8 a 128 caracteres.");
      const cod = u && db.get("SELECT 1 FROM codigos_redefinicao WHERE usuario_id = ? AND codigo_hash = ? AND expira_em > ?", u.id, sha256(String(corpo.codigo || "").trim().toUpperCase()), agora());
      if (!cod) throw new Erro(400, "Código inválido ou vencido. Peça um novo código a um administrador.");
      db.tx(() => {
        db.run("UPDATE usuarios SET senha_hash = ? WHERE id = ?", hashSenha(nova), u.id);
        db.run("DELETE FROM codigos_redefinicao WHERE usuario_id = ?", u.id);
        db.run("DELETE FROM sessoes WHERE usuario_id = ?", u.id);
      });
      auditar(u.id, "senha_redefinida", null, ip);
      return { ok: true };
    },

    "GET /api/eu": ({ usuario }) => ({ perfil: perfilDe(usuario.id) }),

    "POST /api/eu/prefs": ({ usuario, corpo }) => {
      db.run("UPDATE usuarios SET modo_serio = ? WHERE id = ?", corpo.modoSerio ? 1 : 0, usuario.id);
      return { perfil: perfilDe(usuario.id) };
    },

    "POST /api/eu/excluir": ({ usuario, corpo, res, ip }) => {
      const u = db.get("SELECT senha_hash FROM usuarios WHERE id = ?", usuario.id);
      if (!conferirSenha(String(corpo.senha || ""), u.senha_hash)) throw new Erro(401, "Senha incorreta.");
      db.run("DELETE FROM usuarios WHERE id = ?", usuario.id);
      auditar(null, "conta_excluida", null, ip);
      limparCookie(res);
      return { ok: true };
    },

    "GET /api/ranking": ({ usuario }) => {
      const linhas = db.all(`
        SELECT u.id, u.apelido, u.patente,
               COALESCE(SUM(m.melhor_pontos), 0) AS pontos,
               COALESCE(SUM(m.melhor_opcionais), 0) AS opcionais,
               COALESCE(SUM(m.melhor_tempo), 0) AS tempo,
               COALESCE(SUM(CASE WHEN m.concluida = 1 AND m.missao <> 'final' THEN 1 ELSE 0 END), 0) AS missoes
        FROM usuarios u JOIN missoes_usuario m ON m.usuario_id = u.id
        GROUP BY u.id HAVING missoes > 0
        ORDER BY pontos DESC, opcionais DESC, tempo ASC, u.id ASC LIMIT 100`)
        .map((r) => ({ id: String(r.id), apelido: r.apelido, patente: PATENTES[r.patente].nome, pontos: r.pontos, opcionais: r.opcionais, tempo: r.tempo, missoes: r.missoes }));
      return { linhas, eu: usuario ? String(usuario.id) : null };
    },

    "POST /api/corrida/iniciar": ({ usuario, corpo }) => {
      const missao = String(corpo.missao || "");
      const c = CAMPANHA.find((x) => x.id === missao);
      if (!c || !FASES[missao] || !c.jogavel) throw new Erro(400, "Missão inválida.");
      if (!limitar("corrida:" + usuario.id, 30, 60e3)) throw new Erro(429, "Calma: muitas partidas em pouco tempo.");
      if (c.pre && !concluidasDe(usuario.id).has(c.pre)) throw new Erro(403, "Conclua a missão anterior primeiro.");
      const id = crypto.randomUUID();
      db.run("UPDATE corridas SET status = 'abandonada' WHERE usuario_id = ? AND missao = ? AND status = 'ativa'", usuario.id, missao);
      db.run("INSERT INTO corridas (id, usuario_id, missao, iniciada_em) VALUES (?, ?, ?, ?)", id, usuario.id, missao, agora());
      return { corrida: id };
    },

    "POST /api/corrida/evento": ({ usuario, corpo }) => {
      if (!limitar("evento:" + usuario.id, 600, 60e3)) throw new Erro(429, "Eventos demais.");
      const c = corridaDo(usuario.id, corpo.corrida);
      return { ok: registrarEvento(c, corpo.evento) };
    },

    "POST /api/corrida/quiz": ({ usuario, corpo }) => {
      const c = corridaDo(usuario.id, corpo.corrida);
      const F = FASES[c.missao];
      const altar = altaresDe(F).find((a) => a.chave === String(corpo.altar || ""));
      if (!altar) throw new Erro(400, "Marco inválido.");
      if (altar.chave === "pedra" && !db.get("SELECT 1 FROM corrida_eventos WHERE corrida_id = ? AND evento = 'boneco'", c.id)) throw new Erro(409, "Primeiro derrote o boneco de treino.");
      let linhas = db.all("SELECT pergunta_id, resposta FROM corrida_perguntas WHERE corrida_id = ? AND altar = ? ORDER BY ordem", c.id, altar.chave);
      if (!linhas.length) {
        const usadas = new Set(db.all("SELECT pergunta_id FROM corrida_perguntas WHERE corrida_id = ?", c.id).map((r) => r.pergunta_id));
        const sel = sortearPerguntas(CAT.lista, altar.temas, altar.qtd, usadas);
        if (sel.length < altar.qtd) throw new Erro(500, "Não há perguntas suficientes para este marco.");
        db.tx(() => sel.forEach((q, i) => db.run("INSERT INTO corrida_perguntas (corrida_id, pergunta_id, versao, altar, ordem) VALUES (?, ?, ?, ?, ?)", c.id, q.chave, q.versao, altar.chave, i)));
        linhas = sel.map((q) => ({ pergunta_id: q.chave, resposta: null }));
      }
      return { perguntas: linhas.map((l) => ({ ...semResposta(CAT.perguntas.get(l.pergunta_id)), respondida: l.resposta !== null })) };
    },

    "POST /api/corrida/responder": ({ usuario, corpo }) => {
      const c = corridaDo(usuario.id, corpo.corrida);
      const chave = String(corpo.pergunta);
      const linha = db.get("SELECT * FROM corrida_perguntas WHERE corrida_id = ? AND pergunta_id = ?", c.id, chave);
      if (!linha) throw new Erro(400, "Esta pergunta não foi sorteada nesta partida.");
      const q = CAT.perguntas.get(chave);
      const resposta = Number(corpo.resposta);
      if (linha.resposta === null) {
        if (!Number.isInteger(resposta) || resposta < 0 || resposta >= q.alternativas.length) throw new Erro(400, "Resposta inválida.");
        const ok = resposta === q.correta;
        db.run("UPDATE corrida_perguntas SET resposta = ?, ok = ?, pontos = ?, respondida_em = ? WHERE corrida_id = ? AND pergunta_id = ?",
          resposta, ok ? 1 : 0, pontosDaPergunta(PARAMS, q, ok), agora(), c.id, chave);
      }
      const l = db.get("SELECT resposta, ok, pontos FROM corrida_perguntas WHERE corrida_id = ? AND pergunta_id = ?", c.id, chave);
      return { ok: !!l.ok, resposta: l.resposta, correta: q.correta, explicacao: q.explicacao, zoeira: q.zoeira || "", pontos: l.pontos };
    },

    "POST /api/corrida/concluir": ({ usuario, corpo }) => {
      const c = corridaDo(usuario.id, corpo.corrida);
      const F = FASES[c.missao];
      (Array.isArray(corpo.eventos) ? corpo.eventos.slice(0, 200) : []).forEach((e) => registrarEvento(c, e));
      const tempo = Math.round((Date.now() - Date.parse(c.iniciada_em)) / 1000);
      if (tempo < MIN_SEGUNDOS_MISSAO) throw new Erro(409, "Partida rápida demais para ser válida.");
      for (const a of altaresDe(F)) {
        const r = db.get("SELECT COUNT(*) n, SUM(CASE WHEN resposta IS NOT NULL THEN 1 ELSE 0 END) resp FROM corrida_perguntas WHERE corrida_id = ? AND altar = ?", c.id, a.chave);
        if (r.n < a.qtd || r.resp < r.n) throw new Erro(409, `Falta acender: ${a.nome}.`);
      }
      const temEvento = (e) => !!db.get("SELECT 1 FROM corrida_eventos WHERE corrida_id = ? AND evento = ?", c.id, e);
      if (F.boneco && !temEvento("boneco")) throw new Erro(409, "Falta derrotar o boneco de treino.");
      if (F.chefe && !temEvento("chefe")) throw new Erro(409, "Falta derrotar o mestre da fase.");

      return db.tx(() => {
        const patAntes = db.get("SELECT patente FROM usuarios WHERE id = ?", usuario.id).patente;
        const linhas = { quiz: 0, objetivos: PARAMS.objetivoPrincipal, opcionais: 0, inimigos: 0, chefe: 0 };
        let xp = PARAMS.xp.objetivoPrincipal, opcionais = 0;
        for (const e of db.all("SELECT linha, pontos, xp FROM corrida_eventos WHERE corrida_id = ?", c.id)) {
          linhas[e.linha] = (linhas[e.linha] || 0) + e.pontos; xp += e.xp;
          if (e.linha === "opcionais") opcionais++;
        }
        const qs = db.all("SELECT ok, pontos FROM corrida_perguntas WHERE corrida_id = ?", c.id);
        const quizOk = qs.filter((q) => q.ok).length;
        linhas.quiz = qs.reduce((s, q) => s + q.pontos, 0);
        xp += quizOk * PARAMS.xp.acerto + (qs.length - quizOk) * PARAMS.xp.erro;
        const pontos = Object.values(linhas).reduce((s, v) => s + v, 0);
        const prev = db.get("SELECT * FROM missoes_usuario WHERE usuario_id = ? AND missao = ?", usuario.id, c.missao);
        const repeticao = !!(prev && prev.concluida);
        const xpGanho = Math.round(xp * (repeticao ? PARAMS.xpRepeticao : 1));
        const melhorou = !repeticao || pontos > prev.melhor_pontos || (pontos === prev.melhor_pontos && (opcionais > prev.melhor_opcionais || tempo < prev.melhor_tempo));
        if (!prev) db.run("INSERT INTO missoes_usuario (usuario_id, missao) VALUES (?, ?)", usuario.id, c.missao);
        db.run("UPDATE missoes_usuario SET concluida = 1, tentativas = tentativas + 1 WHERE usuario_id = ? AND missao = ?", usuario.id, c.missao);
        if (melhorou) db.run("UPDATE missoes_usuario SET melhor_pontos = ?, melhor_opcionais = ?, melhor_tempo = ? WHERE usuario_id = ? AND missao = ?", pontos, opcionais, tempo, usuario.id, c.missao);
        db.run("UPDATE usuarios SET xp = xp + ? WHERE id = ?", xpGanho, usuario.id);
        db.run("UPDATE corridas SET status = 'concluida', concluida_em = ?, pontos = ?, xp = ? WHERE id = ?", agora(), pontos, xpGanho, c.id);
        const patDepois = recalcularPatente(usuario.id);
        return {
          resultado: { pontos, xp: xpGanho, linhas, opcionais, tempo, quizOk, quizTotal: qs.length, repeticao, melhorou, melhorAnterior: prev && prev.concluida ? prev.melhor_pontos : null },
          patenteAntes: patAntes, patenteDepois: patDepois, perfil: perfilDe(usuario.id)
        };
      });
    },

    "POST /api/prova/iniciar": ({ usuario }) => {
      if (!concluidasDe(usuario.id).has("m7")) throw new Erro(403, "Conclua a Missão 7 para fazer a prova final.");
      const u = db.get("SELECT prova_aprovada FROM usuarios WHERE id = ?", usuario.id);
      const ult = db.get("SELECT enviada_em FROM provas WHERE usuario_id = ? AND enviada_em IS NOT NULL ORDER BY enviada_em DESC LIMIT 1", usuario.id);
      if (!u.prova_aprovada && ult) {
        const libera = Date.parse(ult.enviada_em) + PARAMS.prova.intervaloHoras * 3600e3;
        if (libera > Date.now()) throw new Erro(409, "Nova tentativa ainda não liberada.", { liberaEm: new Date(libera).toISOString() });
      }
      const sel = montarProva(CAT.lista, PARAMS.prova);
      const id = crypto.randomUUID();
      db.run("INSERT INTO provas (id, usuario_id, perguntas, iniciada_em) VALUES (?, ?, ?, ?)", id, usuario.id, JSON.stringify(sel.map((q) => q.chave)), agora());
      return { prova: id, perguntas: sel.map(semResposta) };
    },

    "POST /api/prova/enviar": ({ usuario, corpo, ip }) => {
      const pv = db.get("SELECT * FROM provas WHERE id = ? AND usuario_id = ?", String(corpo.prova || ""), usuario.id);
      if (!pv) throw new Erro(404, "Prova não encontrada.");
      if (pv.enviada_em) throw new Erro(409, "Esta prova já foi enviada.");
      if (Date.now() - Date.parse(pv.iniciada_em) > VALIDADE_PROVA_H * 3600e3) throw new Erro(409, "A prova expirou. Comece de novo.");
      const respostas = new Map((Array.isArray(corpo.respostas) ? corpo.respostas : []).map((r) => [String(r.pergunta), Number(r.resposta)]));
      const revisao = JSON.parse(pv.perguntas).map((chave) => {
        const q = CAT.perguntas.get(chave), resp = respostas.has(chave) ? respostas.get(chave) : -1;
        return { id: q.id, tema: q.tema, pergunta: q.pergunta, alternativas: q.alternativas, resposta: resp, correta: q.correta, ok: resp === q.correta, explicacao: q.explicacao };
      });
      const acertos = revisao.filter((r) => r.ok).length, total = revisao.length, nota = acertos / total;
      const aprovado = nota >= PARAMS.prova.notaMinima;
      return db.tx(() => {
        const patAntes = db.get("SELECT patente FROM usuarios WHERE id = ?", usuario.id).patente;
        db.run("UPDATE provas SET enviada_em = ?, respostas = ?, acertos = ?, total = ?, nota = ?, aprovada = ? WHERE id = ?",
          agora(), JSON.stringify([...respostas]), acertos, total, nota, aprovado ? 1 : 0, pv.id);
        if (aprovado) {
          db.run("UPDATE usuarios SET prova_aprovada = 1 WHERE id = ?", usuario.id);
          db.run("INSERT INTO missoes_usuario (usuario_id, missao, concluida, tentativas) VALUES (?, 'final', 1, 1) ON CONFLICT(usuario_id, missao) DO UPDATE SET concluida = 1, tentativas = tentativas + 1", usuario.id);
        }
        const patDepois = recalcularPatente(usuario.id);
        auditar(usuario.id, "prova", { acertos, total, aprovado }, ip);
        return { acertos, total, nota, aprovado, revisao, patenteAntes: patAntes, patenteDepois: patDepois, perfil: perfilDe(usuario.id) };
      });
    }
  };
  const PUBLICAS = new Set(["GET /api/saude", "POST /api/cadastro", "POST /api/login", "POST /api/sair", "POST /api/redefinir", "GET /api/ranking"]);

  /* ---------------- arquivos estáticos (só para desenvolvimento/testes) ---------------- */
  const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
  function estatico(req, res) {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const nome = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    // as versões com gabarito (artefato/offline) e o template nunca são servidas
    if (/\.(py|md)$/.test(nome) || ["farol-template.html", "farol-da-liberdade.html", "offline.html"].includes(nome) || nome.includes("..")) { res.writeHead(404); return res.end(); }
    const arq = path.join(RAIZ, "jogo", nome);
    fs.readFile(arq, (err, dados) => {
      if (err) { res.writeHead(404); return res.end("Não encontrado"); }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream" });
      res.end(dados);
    });
  }

  /* ---------------- servidor ---------------- */
  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (!url.pathname.startsWith("/api/")) { if (servirEstatico) return estatico(req, res); res.writeHead(404); return res.end(); }
    const chave = `${req.method} ${url.pathname}`;
    const responder = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
    try {
      const rota = rotas[chave];
      if (!rota) throw new Erro(404, "Rota não encontrada.");
      if (req.method === "POST" && req.headers["x-requested-with"] !== "farol") throw new Erro(403, "Requisição recusada.");
      const daRede = req.socket.remoteAddress;
      const ip = (daRede === "127.0.0.1" || daRede === "::1" || daRede === "::ffff:127.0.0.1") && req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : daRede;
      let corpo = {};
      if (req.method === "POST") {
        const partes = []; let tam = 0;
        for await (const parte of req) { tam += parte.length; if (tam > LIMITE_CORPO) throw new Erro(413, "Requisição grande demais."); partes.push(parte); }
        if (tam) { try { corpo = JSON.parse(Buffer.concat(partes).toString("utf8")); } catch (e) { throw new Erro(400, "JSON inválido."); } }
        if (!corpo || typeof corpo !== "object") corpo = {};
      }
      const sessao = usuarioDaSessao(req);
      if (!PUBLICAS.has(chave) && !sessao) throw new Erro(401, "Entre na sua conta para continuar.");
      const usuario = sessao ? { id: sessao.id } : null;
      const saida = await rota({ req, res, corpo, ip, sessao, usuario });
      responder(200, saida);
    } catch (e) {
      if (e instanceof Erro) return responder(e.status, { erro: e.message, ...(e.extra || {}) });
      console.error(new Date().toISOString(), chave, e);
      responder(500, { erro: "Erro interno. Tente de novo em instantes." });
    }
  });
  servidor.on("close", () => db.fechar());
  return { servidor, db, CAT };
}

// para rodar: node servidor/iniciar.mjs
