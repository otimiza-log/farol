// Teste ponta a ponta do jogo com o servidor de verdade (modo VPS):
//   node testes/servidor.mjs <pasta-saida> <caminho-do-chrome>
// Sobe a API com banco temporário, abre jogo/index.html servido por ela e joga como um usuário.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const [, , outDir, chrome] = process.argv;
mkdirSync(outDir, { recursive: true });
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const ok = (cond, msg) => log((cond ? "  OK   " : "  FALHA ") + msg);

// API
const banco = path.join(os.tmpdir(), `farol-teste-${Date.now()}.db`);
const PORTA = 3999;
const api = spawn(process.execPath, [path.join(RAIZ, "servidor", "iniciar.mjs")], {
  env: { ...process.env, PORT: String(PORTA), FAROL_DB: banco, FAROL_ESTATICO: "1", FAROL_MIN_SEGUNDOS: "0" }, stdio: ["ignore", "pipe", "pipe"]
});
let saidaApi = ""; api.stdout.on("data", (d) => saidaApi += d); api.stderr.on("data", (d) => saidaApi += d);
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORTA}/api/saude`)).ok) break; } catch (e) {} await sleep(200); }
log("API:", (await (await fetch(`http://127.0.0.1:${PORTA}/api/saude`)).json()));

// Chrome
const port = 9339;
rmSync(path.join(os.tmpdir(), "farol-e2e-srv"), { recursive: true, force: true }); // perfil limpo a cada execução
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "farol-e2e-srv")}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
let targets;
for (let i = 0; i < 120; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch (e) {} await sleep(250); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map(); const logs = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") logs.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push("ERR " + m.params.args.map((a) => a.value ?? a.description).join(" "));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "ERR " + r.result.exceptionDetails.exception?.description : r.result?.result?.value; };
const shot = async (n) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(outDir, n + ".png"), Buffer.from(r.result.data, "base64")); };
const ir = (x, y = 430) => ev(`const s=cena(); s.player.setPosition(${x},${y}); s.player.body.setVelocity(0,0);`);
const URL_JOGO = `http://127.0.0.1:${PORTA}/`;

try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL_JOGO }); await sleep(2500);

  log("\n[Conta]");
  const ini = await ev(`return {servidor: MODO_SERVIDOR, banco: BANCO.length, conta: !document.getElementById('form-conta').hidden, local: !document.getElementById('form-signin').hidden}`);
  ok(ini.servidor && ini.banco === 0 && ini.conta && !ini.local, "versão da VPS: modo servidor, sem banco/gabarito no navegador, tela de conta " + JSON.stringify(ini));
  const priv = await ev(`document.querySelector('#form-conta .tab[data-aba=criar]').click(); document.getElementById('ct-priv').click(); await new Promise(r=>setTimeout(r,100)); const t=document.getElementById('m-priv').innerText; document.getElementById('mpv-ok').click(); return t.includes('excluir sua conta')`);
  ok(priv, "política de privacidade abre a partir do cadastro");
  const semAceite = await ev(`document.getElementById('ct-apelido').value='Servidor1'; document.getElementById('ct-senha').value='segredo123'; document.getElementById('form-conta').requestSubmit(); await new Promise(r=>setTimeout(r,300)); return document.getElementById('ct-err').textContent`);
  ok(semAceite.includes("aceite"), "cadastro exige aceitar a política: " + semAceite);
  await ev(`document.getElementById('ct-aceite').checked=true; document.getElementById('form-conta').requestSubmit();`); await sleep(1200);
  const central = await ev(`return {central: !document.getElementById('scr-central').hidden, apelido: document.getElementById('c-apelido').textContent, modo: document.getElementById('c-mode').textContent, sair: !document.getElementById('btn-sair').hidden}`);
  ok(central.central && central.apelido === "Servidor1" && central.modo.includes("servidor") && central.sair, "cadastro entra na central " + JSON.stringify(central));
  await shot("s01-central");

  log("\n[Prólogo jogado com o servidor]");
  await ev(`abrirIntro('m0')`); await sleep(300); await ev(`document.getElementById('mi-go').click()`); await sleep(2500);
  ok(typeof (await ev(`return CORRIDA`)) === "string", "missão abre uma partida no servidor");
  // boneco
  await ev(`const s=cena(); s.player.setPosition(975,440); s.facing=1; s.player.setFlipX(false)`); await sleep(300);
  for (let i = 0; i < 3; i++) { await ev(`const s=cena(); s.atkCd=0; s.atacar()`); await sleep(250); }
  // pedra: quiz vindo do servidor
  await ir(1720); await sleep(1200);
  const qz = await ev(`return {aberto: !document.getElementById('m-quiz').hidden, n: document.getElementById('mq-count').textContent}`);
  ok(qz.aberto, "pedra abre o quiz com perguntas do servidor: " + qz.n);
  await sleep(800); await ev(`document.getElementById('mq-start').click()`);
  const respostas = [];
  for (let k = 0; k < 3; k++) {
    await sleep(600);
    await ev(`document.getElementById('mq-opts').children[0].click()`);
    await sleep(600);
    respostas.push(await ev(`return {veredito: document.getElementById('mq-verdict').textContent, explicacao: document.getElementById('mq-exp').textContent.length, marcada: document.querySelectorAll('#mq-opts .right').length}`));
    await sleep(450); await ev(`document.getElementById('mq-next').click()`);
  }
  ok(respostas.every((r) => /pontos/.test(r.veredito) && r.explicacao > 20 && r.marcada === 1), "servidor corrige cada resposta e devolve a explicação " + JSON.stringify(respostas.map((r) => r.veredito)));
  await shot("s02-quiz");
  // inimigo
  await sleep(500);
  for (let i = 0; i < 8; i++) { await ev(`const s=cena(); const e=s.inimigos.getChildren()[0]; if(e){ s.invuln=500; s.player.setPosition(e.x-40, e.y); s.facing=1; s.atkCd=0; s.atacar(); }`); await sleep(300); }
  // estandarte
  await ir(2370); await sleep(3000);
  const res = await ev(`return {tela: !document.getElementById('scr-result').hidden, pts: document.getElementById('r-pts').textContent, salvo: document.getElementById('r-saved').textContent, quadro: [...document.querySelectorAll('#r-breakdown tr')].map(t=>t.textContent).join(' | '), promo: document.getElementById('r-promo').textContent}`);
  ok(res.tela && Number(res.pts) > 200 && res.salvo.includes("servidor"), "resultado calculado pelo servidor " + JSON.stringify(res));
  await shot("s03-resultado");

  log("\n[Ranking real]");
  await ev(`document.getElementById('r-ranking').click()`); await sleep(1200);
  const rk = await ev(`return [...document.querySelectorAll('#k-body tr')].map(t=>t.textContent).join(' | ')`);
  ok(rk.includes("Servidor1 (você)"), "ranking vem do servidor e destaca o jogador: " + rk.slice(0, 120));
  await shot("s04-ranking");

  log("\n[Sessão persiste]");
  await send("Page.reload"); await sleep(2500);
  const volta = await ev(`return {central: !document.getElementById('scr-central').hidden, m0: document.querySelector('.mission .act').textContent}`);
  ok(volta.central && volta.m0.includes("Concluída"), "recarregar a página mantém o login e o progresso " + JSON.stringify(volta));

  log("\n[Trapaça]");
  const trapaca = await ev(`
    const h = {'Content-Type':'application/json','X-Requested-With':'farol'};
    const ini = await (await fetch('/api/corrida/iniciar',{method:'POST',headers:h,body:JSON.stringify({missao:'m1'})})).json();
    const ev1 = await (await fetch('/api/corrida/evento',{method:'POST',headers:h,body:JSON.stringify({corrida:ini.corrida, evento:'col:99'})})).json();
    const fim = await fetch('/api/corrida/concluir',{method:'POST',headers:h,body:JSON.stringify({corrida:ini.corrida, eventos:['chefe','inimigo:0']})});
    const m7 = await fetch('/api/corrida/iniciar',{method:'POST',headers:h,body:JSON.stringify({missao:'m7'})});
    return {eventoFalso: ev1.ok, concluirSemJogar: fim.status, pularMissoes: m7.status}`);
  ok(trapaca.eventoFalso === false && trapaca.concluirSemJogar === 409 && trapaca.pularMissoes === 403, "servidor recusa evento falso, conclusão sem jogar e pular missões " + JSON.stringify(trapaca));

  log("\n[Sair e entrar]");
  await ev(`document.getElementById('btn-sair').click()`); await sleep(800);
  ok(!(await ev(`return document.getElementById('scr-home').hidden`)), "sair volta para a tela de conta");
  const errada = await ev(`document.querySelector('#form-conta .tab[data-aba=entrar]').click(); document.getElementById('ct-apelido').value='Servidor1'; document.getElementById('ct-senha').value='errada99'; document.getElementById('form-conta').requestSubmit(); await new Promise(r=>setTimeout(r,800)); return document.getElementById('ct-err').textContent`);
  ok(errada === "Apelido ou senha incorretos.", "senha errada mostra o aviso: " + errada);
  await ev(`document.getElementById('ct-senha').value='segredo123'; document.getElementById('form-conta').requestSubmit();`); await sleep(1200);
  ok((await ev(`return document.getElementById('c-xp').textContent`)) !== "0", "login traz de volta o XP salvo no servidor");

  // celular
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev(`document.getElementById('btn-sair').click()`); await sleep(800);
  await shot("s05-conta-celular");
  log("\nLOGS do navegador:", logs.length ? logs.join(" || ") : "nenhum erro");
  log("LOGS da API:", /Error|erro interno/i.test(saidaApi) ? saidaApi : "sem erros");
} finally {
  ws.close(); proc.kill(); api.kill();
  await sleep(300);
  try { rmSync(banco, { force: true }); rmSync(banco + "-wal", { force: true }); rmSync(banco + "-shm", { force: true }); } catch (e) { /* ok */ }
  process.exit(0);
}
