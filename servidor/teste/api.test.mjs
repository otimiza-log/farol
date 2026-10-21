// Testes da API: cd servidor && node --test teste/*.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.FAROL_MIN_SEGUNDOS = "0";
const { criarApp } = await import("../app.mjs");
let app, base;

before(async () => {
  app = await criarApp({ arquivoBanco: ":memory:" });
  await new Promise((r) => app.servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.servidor.address().port}`;
});
after(() => new Promise((r) => app.servidor.close(r)));

// cliente com "pote de cookies"
function cliente() {
  let cookie = "";
  return async (metodo, rota, corpo, extra = {}) => {
    const r = await fetch(base + rota, {
      method: metodo,
      headers: { "Content-Type": "application/json", "X-Requested-With": "farol", ...(cookie ? { Cookie: cookie } : {}), ...extra },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0].endsWith("=") ? "" : sc.split(";")[0];
    return { status: r.status, dados: await r.json(), setCookie: sc };
  };
}
const responderTudo = async (api, corrida, altar, certo = true) => {
  const { dados } = await api("POST", "/api/corrida/quiz", { corrida, altar });
  for (const q of dados.perguntas) {
    const correta = app.CAT.perguntas.get(String(q.id)).correta;
    await api("POST", "/api/corrida/responder", { corrida, pergunta: q.id, resposta: certo ? correta : (correta + 1) % 4 });
  }
  return dados.perguntas;
};
const jogar = async (api, missao) => {
  const { dados } = await api("POST", "/api/corrida/iniciar", { missao });
  const F = app.CAT.FASES[missao];
  if (F.boneco) await api("POST", "/api/corrida/evento", { corrida: dados.corrida, evento: "boneco" });
  if (F.pedra) await responderTudo(api, dados.corrida, "pedra");
  for (let i = 0; i < (F.altares || []).length; i++) await responderTudo(api, dados.corrida, `altar${i}`);
  const eventos = (F.inimigos || []).map((_, i) => `inimigo:${i}`);
  if (F.chefe) eventos.push("chefe");
  return api("POST", "/api/corrida/concluir", { corrida: dados.corrida, eventos });
};

test("saúde e catálogo carregado do template", async () => {
  const r = await cliente()("GET", "/api/saude");
  assert.equal(r.status, 200);
  assert.equal(r.dados.perguntas, 115);
});

test("cadastro: validações, cookie httpOnly e perfil", async () => {
  const api = cliente();
  assert.equal((await api("POST", "/api/cadastro", { apelido: "ab", senha: "12345678", aceite: true })).status, 400);
  assert.equal((await api("POST", "/api/cadastro", { apelido: "Fulano", senha: "curta", aceite: true })).status, 400);
  assert.equal((await api("POST", "/api/cadastro", { apelido: "Fulano", senha: "segredo123" })).status, 400, "exige aceite");
  const r = await api("POST", "/api/cadastro", { apelido: "Fulano", senha: "segredo123", aceite: true });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /HttpOnly/);
  assert.equal(r.dados.perfil.apelido, "Fulano");
  assert.equal((await cliente()("POST", "/api/cadastro", { apelido: "fulano", senha: "outra12345", aceite: true })).status, 409, "apelido único sem diferenciar maiúsculas");
  assert.equal((await api("GET", "/api/eu")).dados.perfil.patente, 0);
});

test("login, senha errada, sair e rotas protegidas", async () => {
  const api = cliente();
  assert.equal((await api("POST", "/api/login", { apelido: "Fulano", senha: "errada123" })).status, 401);
  assert.equal((await api("GET", "/api/eu")).status, 401);
  assert.equal((await api("POST", "/api/login", { apelido: "FULANO", senha: "segredo123" })).status, 200);
  assert.equal((await api("GET", "/api/eu")).status, 200);
  await api("POST", "/api/sair");
  assert.equal((await api("GET", "/api/eu")).status, 401);
});

test("proteção: POST sem cabeçalho do jogo é recusado (CSRF)", async () => {
  const r = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403);
});

test("quiz: servidor não entrega o gabarito e confere a resposta", async () => {
  const api = cliente();
  await api("POST", "/api/cadastro", { apelido: "Quizeiro", senha: "segredo123", aceite: true });
  const { dados } = await api("POST", "/api/corrida/iniciar", { missao: "m0" });
  assert.equal((await api("POST", "/api/corrida/quiz", { corrida: dados.corrida, altar: "pedra" })).status, 409, "pedra exige o boneco");
  await api("POST", "/api/corrida/evento", { corrida: dados.corrida, evento: "boneco" });
  const qz = await api("POST", "/api/corrida/quiz", { corrida: dados.corrida, altar: "pedra" });
  assert.equal(qz.dados.perguntas.length, 3);
  for (const q of qz.dados.perguntas) { assert.equal(q.correta, undefined); assert.equal(q.explicacao, undefined); }
  const q = qz.dados.perguntas[0], certa = app.CAT.perguntas.get(String(q.id)).correta;
  const r1 = await api("POST", "/api/corrida/responder", { corrida: dados.corrida, pergunta: q.id, resposta: (certa + 1) % 4 });
  assert.equal(r1.dados.ok, false); assert.equal(r1.dados.correta, certa); assert.ok(r1.dados.explicacao);
  const r2 = await api("POST", "/api/corrida/responder", { corrida: dados.corrida, pergunta: q.id, resposta: certa });
  assert.equal(r2.dados.ok, false, "a primeira resposta vale: não dá para responder de novo");
  const repetida = await api("POST", "/api/corrida/quiz", { corrida: dados.corrida, altar: "pedra" });
  assert.deepEqual(repetida.dados.perguntas.map((x) => x.id), qz.dados.perguntas.map((x) => x.id), "mesmo marco devolve as mesmas perguntas");
  const fora = await api("POST", "/api/corrida/responder", { corrida: dados.corrida, pergunta: "C1", resposta: 0 });
  assert.equal(fora.status, 400, "pergunta não sorteada é recusada");
});

test("partida: concluir exige marcos e boneco; eventos inválidos ou repetidos não contam", async () => {
  const api = cliente();
  await api("POST", "/api/cadastro", { apelido: "Jogador1", senha: "segredo123", aceite: true });
  assert.equal((await api("POST", "/api/corrida/iniciar", { missao: "m1" })).status, 403, "m1 exige m0");
  const { dados } = await api("POST", "/api/corrida/iniciar", { missao: "m0" });
  assert.equal((await api("POST", "/api/corrida/concluir", { corrida: dados.corrida, eventos: [] })).status, 409, "sem marco aceso não conclui");
  await api("POST", "/api/corrida/evento", { corrida: dados.corrida, evento: "boneco" });
  await responderTudo(api, dados.corrida, "pedra");
  assert.equal((await api("POST", "/api/corrida/evento", { corrida: dados.corrida, evento: "inimigo:99" })).dados.ok, false);
  const fim = await api("POST", "/api/corrida/concluir", { corrida: dados.corrida, eventos: ["inimigo:0", "inimigo:0", "chefe", "col:5", "xp:9999"] });
  assert.equal(fim.status, 200);
  const r = fim.dados.resultado;
  assert.equal(r.linhas.inimigos, 5, "inimigo contado uma vez; ids inexistentes ignorados");
  assert.equal(r.linhas.chefe, 0, "Prólogo não tem mestre");
  assert.equal(r.pontos, r.linhas.quiz + 200 + 5);
  assert.equal(fim.dados.patenteDepois, 1, "Audiência do YouTube");
  assert.equal((await api("POST", "/api/corrida/concluir", { corrida: dados.corrida })).status, 409, "partida encerrada não conclui de novo");
  const rep = await jogar(api, "m0");
  assert.equal(rep.dados.resultado.repeticao, true);
  assert.equal(rep.dados.resultado.xp, Math.round((150 + 10 + 3 * 30) * 0.2), "repetição rende 20% do XP");
});

test("teto de pontos por inimigos e mestre obrigatório", async () => {
  const api = cliente();
  await api("POST", "/api/cadastro", { apelido: "Campeao", senha: "segredo123", aceite: true });
  for (const m of ["m0", "m1", "m2", "m3"]) assert.equal((await jogar(api, m)).status, 200, m);
  const { dados } = await api("POST", "/api/corrida/iniciar", { missao: "m4" });
  for (let i = 0; i < 3; i++) await responderTudo(api, dados.corrida, `altar${i}`);
  assert.equal((await api("POST", "/api/corrida/concluir", { corrida: dados.corrida })).status, 409, "m4 exige derrotar a Cria de Deodoro");
  const fim = await api("POST", "/api/corrida/concluir", { corrida: dados.corrida, eventos: ["chefe", ...Array.from({ length: 30 }, (_, i) => `inimigo:${i}`)] });
  assert.equal(fim.dados.resultado.linhas.chefe, 300);
  assert.ok(fim.dados.resultado.linhas.inimigos <= 100);
});

test("ranking soma o melhor de cada missão e ordena", async () => {
  const r = await cliente()("GET", "/api/ranking");
  assert.ok(r.dados.linhas.length >= 2);
  const pts = r.dados.linhas.map((l) => l.pontos);
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a));
  assert.equal(r.dados.linhas[0].apelido, "Campeao");
});

test("prova final: exige m7, esconde gabarito, reprova, bloqueia e aprova", async () => {
  const api = cliente();
  await api("POST", "/api/cadastro", { apelido: "Cavaleiro", senha: "segredo123", aceite: true });
  assert.equal((await api("POST", "/api/prova/iniciar")).status, 403);
  for (const m of ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7"]) assert.equal((await jogar(api, m)).status, 200, m);
  const p1 = await api("POST", "/api/prova/iniciar");
  assert.equal(p1.dados.perguntas.length, 20);
  assert.ok(p1.dados.perguntas.every((q) => q.correta === undefined));
  const e1 = await api("POST", "/api/prova/enviar", { prova: p1.dados.prova, respostas: [] });
  assert.equal(e1.dados.aprovado, false); assert.equal(e1.dados.revisao.length, 20);
  const bloq = await api("POST", "/api/prova/iniciar");
  assert.equal(bloq.status, 409); assert.ok(bloq.dados.liberaEm);
  app.CAT.PARAMS.prova.intervaloHoras = 0;
  const p2 = await api("POST", "/api/prova/iniciar");
  const respostas = p2.dados.perguntas.map((q) => ({ pergunta: q.id, resposta: app.CAT.perguntas.get(String(q.id)).correta }));
  const e2 = await api("POST", "/api/prova/enviar", { prova: p2.dados.prova, respostas });
  assert.equal(e2.dados.aprovado, true);
  assert.equal(app.CAT.PATENTES[e2.dados.patenteDepois].nome, "Cavaleiro do Farol");
  assert.equal((await api("POST", "/api/prova/enviar", { prova: p2.dados.prova, respostas })).status, 409, "não reenviar");
  app.CAT.PARAMS.prova.intervaloHoras = 24;
});

test("redefinição de senha por código e exclusão da conta", async () => {
  const api = cliente();
  await api("POST", "/api/cadastro", { apelido: "Esquecido", senha: "senhaantiga1", aceite: true });
  assert.equal((await api("POST", "/api/redefinir", { apelido: "Esquecido", codigo: "XXXXXXXX", novaSenha: "senhanova12" })).status, 400);
  const crypto = await import("node:crypto");
  const uid = app.db.get("SELECT id FROM usuarios WHERE apelido = 'Esquecido'").id;
  app.db.run("INSERT INTO codigos_redefinicao (usuario_id, codigo_hash, expira_em) VALUES (?, ?, ?)", uid, crypto.createHash("sha256").update("ABCD2345").digest("hex"), new Date(Date.now() + 3600e3).toISOString());
  assert.equal((await api("POST", "/api/redefinir", { apelido: "Esquecido", codigo: "abcd2345", novaSenha: "senhanova12" })).status, 200);
  assert.equal((await api("GET", "/api/eu")).status, 401, "redefinir encerra as sessões");
  assert.equal((await api("POST", "/api/login", { apelido: "Esquecido", senha: "senhanova12" })).status, 200);
  assert.equal((await api("POST", "/api/eu/excluir", { senha: "errada" })).status, 401);
  assert.equal((await api("POST", "/api/eu/excluir", { senha: "senhanova12" })).status, 200);
  assert.equal((await cliente()("POST", "/api/login", { apelido: "Esquecido", senha: "senhanova12" })).status, 401);
});

test("limite de tentativas de login", async () => {
  const api = cliente();
  let ultimo;
  for (let i = 0; i < 12; i++) ultimo = await api("POST", "/api/login", { apelido: "Ninguem", senha: "x" }, { "X-Forwarded-For": "10.9.9.9" });
  assert.equal(ultimo.status, 429);
});
