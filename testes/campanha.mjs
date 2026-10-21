// Joga Prólogo → Missão 3 e verifica as mecânicas novas (CDP, Chrome headless)
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const [, , htmlPath, outDir, chrome] = process.argv;
mkdirSync(outDir, { recursive: true });
const port = 9338;
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "farol-e2e-camp")}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const log = (...a) => console.log(...a);
const ok = (cond, msg) => log((cond ? "  OK   " : "  FALHA ") + msg);

// o quiz abre numa tela de confirmação e cada etapa tem um intervalo de segurança: o teste espera como um jogador
const responderTudo = async () => ev(`
  const espera = (ms) => new Promise(r => setTimeout(r, ms));
  if (document.getElementById('m-quiz').hidden) return 'quiz não abriu';
  await espera(800); document.getElementById('mq-start').click();
  for (let n = 0; n < 6; n++) {
    if (document.getElementById('m-quiz').hidden) break;
    await espera(550);
    const q = BANCO.find(b => b.pergunta === document.getElementById('mq-q').textContent);
    [...document.getElementById('mq-opts').children].find(o => Number(o.dataset.idx) === q.correta).click();
    await espera(500);
    document.getElementById('mq-next').click();
  }
  await espera(200);
  return document.getElementById('m-quiz').hidden;`);
const K = { KeyD: ["d", 68], Digit4: ["4", 52], Digit1: ["1", 49], Enter: ["Enter", 13] };
const tecla = (code, type, repeat = false) => send("Input.dispatchKeyEvent", { type, code, key: K[code][0], windowsVirtualKeyCode: K[code][1], autoRepeat: repeat, text: type === "keyDown" && code !== "Enter" ? K[code][0] : undefined });
const ir = (x, y = 430) => ev(`const s=cena(); s.player.setPosition(${x},${y}); s.player.body.setVelocity(0,0);`);
const acenderTodos = async () => {
  const xs = await ev(`return cena().altares.map(a=>a.x)`);
  for (const x of xs) { await ir(x); await sleep(600); await responderTudo(); await sleep(300); }
  return ev(`const s=cena(); return s.altares.filter(a=>a.aceso).length + '/' + s.altares.length`);
};
const iniciar = async (id) => { await ev(`abrirIntro('${id}')`); await sleep(300); await ev(`document.getElementById('mi-go').click()`); await sleep(2200); };
const concluir = async (x) => { await ir(x); await sleep(2300); return ev(`return {pts: document.getElementById('r-pts').textContent, xp: document.getElementById('r-xp').textContent, promo: document.getElementById('r-promo').textContent.replace('Nova patente','').replace('A luz ficou um pouco mais forte.','')}`); };

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "file:///" + htmlPath.replace(/\\/g, "/") });
await sleep(3000);
await ev(`document.getElementById('in-apelido').value='Testador'; document.getElementById('form-signin').requestSubmit();`); await sleep(1000);
log("missões na central:", await ev(`return [...document.querySelectorAll('.mission .act')].slice(0,4).map(a=>a.textContent).join(' | ')`));

// ---------- Prólogo e Missão 1 (regressão rápida) ----------
log("\n[Prólogo]");
await iniciar("m0");
await ev(`const s=cena(); s.run.concluidos.add('boneco'); s.boneco && s.boneco.destroy(); s.boneco=null;`);
// proteção do quiz: chega na pedra SEGURANDO a tecla D (com repetição), aperta 4 cedo demais e repetido
await ir(1640); await sleep(300);
await tecla("KeyD", "keyDown");
for (let i = 0; i < 12; i++) { await tecla("KeyD", "keyDown", true); await sleep(60); }
await tecla("Digit4", "keyDown"); await tecla("Digit4", "keyUp");
await tecla("KeyD", "keyUp");
const prot1 = await ev(`return {quizAberto: !document.getElementById('m-quiz').hidden, naConfirmacao: !document.getElementById('mq-intro').hidden, respostas: cena().run.quizTotal}`);
ok(prot1.quizAberto && prot1.naConfirmacao && prot1.respostas === 0, "segurar D até a pedra abre a confirmação e não responde nada " + JSON.stringify(prot1));
await sleep(800);
await tecla("Enter", "keyDown"); await tecla("Enter", "keyUp"); await sleep(120);
await tecla("Digit1", "keyDown"); await tecla("Digit1", "keyUp"); // cedo demais: ignorada
for (let i = 0; i < 6; i++) await tecla("Digit4", "keyDown", true); // repetida: ignorada
const prot2 = await ev(`return {naPergunta: !document.getElementById('mq-corpo').hidden, respostas: cena().run.quizTotal}`);
ok(prot2.naPergunta && prot2.respostas === 0, "Enter mostra a pergunta; tecla cedo demais ou repetida não responde " + JSON.stringify(prot2));
await sleep(600); await tecla("Digit4", "keyUp");
await tecla("Digit1", "keyDown"); await tecla("Digit1", "keyUp"); await sleep(200);
ok((await ev(`return cena().run.quizTotal`)) === 1, "depois do intervalo, a tecla 1 responde normalmente");
await sleep(500); await tecla("Enter", "keyDown"); await tecla("Enter", "keyUp"); await sleep(300);
// termina a pedra pelo caminho normal (já está na 2ª pergunta)
await ev(`
  const espera = (ms) => new Promise(r => setTimeout(r, ms));
  for (let n = 0; n < 4; n++) {
    if (document.getElementById('m-quiz').hidden) break;
    await espera(550);
    const q = BANCO.find(b => b.pergunta === document.getElementById('mq-q').textContent);
    [...document.getElementById('mq-opts').children].find(o => Number(o.dataset.idx) === q.correta).click();
    await espera(500); document.getElementById('mq-next').click();
  }`);
await sleep(300);
log("  resultado:", JSON.stringify(await concluir(2370)));
log("\n[Missão 1]");
await ev(`document.getElementById('r-next').click()`); await sleep(300); await ev(`document.getElementById('mi-go').click()`); await sleep(2200);
log("  pilares:", await acenderTodos());
await ir(1444, 220); await sleep(400);
log("  objetivo HUD:", await ev(`return document.getElementById('h-obj').textContent`));
log("  resultado:", JSON.stringify(await concluir(4640)));

// ---------- Missão 2 ----------
log("\n[Missão 2: A Forja das Virtudes]");
ok(!(await ev(`return document.getElementById('r-next').hidden`)), "botão 'Próxima' leva à Missão 2");
await ev(`document.getElementById('r-next').click()`); await sleep(300);
log("  intro:", await ev(`return document.getElementById('mi-title').textContent`));
await ev(`document.getElementById('mi-go').click()`); await sleep(2200);
await shot("c01-missao2");
const tipos2 = await ev(`return cena().inimigos.getChildren().map(e=>e.getData('tipo')).join(',')`);
ok(tipos2.split(",").filter((t) => t === "fanatico").length === 5, "5 Fanáticos e 3 Saqueadores: " + tipos2);
const mx0 = await ev(`return cena().moveis.getChildren().map(m=>Math.round(m.x)).join(',')`); await sleep(700);
const mx1 = await ev(`return cena().moveis.getChildren().map(m=>Math.round(m.x)).join(',')`);
ok(mx0 !== mx1, `plataformas móveis se movem (${mx0} → ${mx1})`);
// carona na plataforma móvel
await ev(`const s=cena(); const m=s.moveis.getChildren()[0]; s.player.setPosition(m.x+64, m.y-30); s.player.body.setVelocity(0,0);`); await sleep(900);
log("  jogador em cima da móvel:", await ev(`const s=cena(); const m=s.moveis.getChildren()[0]; return {jogadorY: Math.round(s.player.y), plataformaY: m.y, sobre: Math.abs((s.player.y+23)-m.y) < 6}`));
// brasas
const v0 = await ev(`return cena().vida`); await ir(1340, 440); await sleep(500);
const v1 = await ev(`return cena().vida`);
ok(v1 < v0, `brasas tiram vida (${v0} → ${v1})`);
await sleep(1200);
// Fanático: investida → atordoado → não fere
await ev(`const s=cena(); s.vida=5; s.atualizarHUD(); const e=s.inimigos.getChildren().find(e=>e.getData('tipo')==='fanatico'); s.player.setPosition(e.x+120, 440); s.player.body.setVelocity(0,0); window._fan=e;`);
let viuAtordoado = false, viuInvestida = false;
for (let i = 0; i < 30; i++) {
  const st = await ev(`const d=window._fan.data.values; return {w:d.windup>0, l:d.lunge>0, a:d.atordoado>0}`);
  if (st.l) viuInvestida = true;
  if (st.a) { viuAtordoado = true; break; }
  await sleep(100);
}
ok(viuInvestida && viuAtordoado, "Fanático investe e depois fica atordoado");
await shot("c02-fanatico-atordoado");
const hpFan = await ev(`const s=cena(); const e=window._fan; s.invuln=0; s.player.setPosition(e.x-30, e.y); s.facing=1; s.atkCd=0; s.atacar(); return e.active ? e.getData('hp') : 0`);
ok(hpFan === 2, "Fanático tem 3 de vida (levou 1 golpe, ficou com " + hpFan + ")");
log("  forjas:", await acenderTodos());
await shot("c03-forja-acesa");
for (const [x, y] of [[1184, 300], [3124, 300], [4284, 310]]) { await ir(x, y); await sleep(350); }
log("  objetivo HUD:", await ev(`return document.getElementById('h-obj').textContent`));
const r2 = await concluir(5070);
log("  resultado:", JSON.stringify(r2));
ok(r2.promo.includes("Membro do Grupo do Wapp"), "promoção para Membro do Grupo do Wapp ao concluir a Missão 2");

// ---------- Missão 3 ----------
log("\n[Missão 3: Vila da Fraternidade]");
await ev(`document.getElementById('r-next').click()`); await sleep(300);
await ev(`document.getElementById('mi-go').click()`); await sleep(2200);
await shot("c04-missao3");
const tipos3 = await ev(`return cena().inimigos.getChildren().map(e=>e.getData('tipo')).join(',')`);
ok(tipos3.split(",").filter((t) => t === "aliciador").length === 4, "4 Aliciadores e 3 Saqueadores: " + tipos3);
// aliciador atira
await ev(`const s=cena(); const e=s.inimigos.getChildren().find(e=>e.getData('tipo')==='aliciador'); s.player.setPosition(e.x-300, 440); s.player.body.setVelocity(0,0); e.setData('recarga', 0);`);
await sleep(400);
const nProj = await ev(`return cena().projeteis.countActive()`);
ok(nProj >= 1, "Aliciador atira promessas (" + nProj + " no ar)");
await shot("c05-promessa");
// rebater promessa com ataque
const rebateu = await ev(`const s=cena(); const pr=s.projeteis.getChildren().find(p=>p.active); if(!pr) return 'sem projetil'; s.player.setPosition(pr.x-30, pr.y); s.player.body.setVelocity(0,0); s.facing=1; s.atkCd=0; s.atacar(); return !pr.active;`);
ok(rebateu === true, "ataque rebate a promessa");
// promessa ACERTA o jogador: perde vida e o jogo continua rodando (regressão do travamento)
await sleep(1200);
const acerto = await ev(`const s=cena(); s.invuln=0; s.vida=5; s.atualizarHUD();
  const e=s.inimigos.getChildren().find(e=>e.getData('tipo')==='aliciador');
  const pr=s.projeteis.create(s.player.x+40, s.player.y, 'promessa'); pr.body.setAllowGravity(false); pr.body.setVelocity(-200, 0);
  const f0=game.loop.frame; await new Promise(r=>setTimeout(r,700));
  return {vida:s.vida, framesDepois: game.loop.frame - f0, ativo: s.sys.isActive()}`);
ok(acerto.vida === 4 && acerto.framesDepois > 10, `promessa que acerta tira 1 de vida e o jogo segue (vida ${acerto.vida}, ${acerto.framesDepois} quadros depois)`);
// várias promessas em sequência, sem rebater, por 6 s
const estresse = await ev(`const s=cena(); s.invuln=0; s.vida=5; s.atualizarHUD();
  const e=s.inimigos.getChildren().filter(e=>e.getData('tipo')==='aliciador')[1]; // longe dos moradores
  s.player.setPosition(e.x+200, 440); s.player.body.setVelocity(0,0);
  const f0=game.loop.frame; await new Promise(r=>setTimeout(r,6000));
  return {vida:s.vida, frames: game.loop.frame - f0, derrota: !document.getElementById('m-defeat').hidden}`);
ok(estresse.frames > 200, `6 s parado na mira do Aliciador sem travar (${estresse.frames} quadros, vida ${estresse.vida})`);
await ev(`document.getElementById('m-defeat').hidden || document.getElementById('md-resume').click(); const s=cena(); if (s) { s.vida=5; s.atualizarHUD(); }`); await sleep(1500);
// morador: +1 de vida
await ev(`const s=cena(); s.vida=3; s.atualizarHUD();`);
await ir(3700, 440); await sleep(400); // morador longe dos testes anteriores
const mor = await ev(`const s=cena(); return {vida:s.vida, ajudado: s.moradores.getChildren()[3].getData('ajudado'), toast: document.getElementById('toast').textContent}`);
ok(mor.vida === 4 && mor.ajudado, "morador reerguido devolve 1 de vida: " + mor.toast);
await shot("c06-morador");
log("  lugares:", await acenderTodos());
for (const x of [620, 1380, 2280]) { await ir(x, 440); await sleep(350); }
log("  objetivo HUD:", await ev(`return document.getElementById('h-obj').textContent`));
const r3 = await concluir(4670);
log("  resultado:", JSON.stringify(r3));
await shot("c07-resultado-m3");

// ---------- Missões 4 a 6: mestres ----------
const MESTRES = [
  { id: "m4", nome: "Cria de Deodoro", fim: 5470, comportamento: `const d=s.chefe.data.values; return d.estado==='golpe' || d.estado==='salto' || s.projeteis.getChildren().some(p=>p.texture.key==='onda')` },
  { id: "m5", nome: "Bolsolepra", fim: 5470, comportamento: `return s.projeteis.getChildren().filter(p=>p.texture.key==='lepra').length >= 3` },
  { id: "m6", nome: "Luladrão", fim: 5670, comportamento: `const d=s.chefe.data.values; return d.estado==='investida' || s.projeteis.getChildren().some(p=>p.texture.key==='propina')` },
  { id: "m7", nome: "Vagabundo do STF", fim: 5870, comportamento: `const d=s.chefe.data.values; return d.estado==='salto' || s.projeteis.getChildren().some(p=>['intimacao','tarja'].includes(p.texture.key))` }
];
for (const M of MESTRES) {
  log(`\n[${M.id}: mestre ${M.nome}]`);
  await ev(`document.getElementById('r-next').click()`); await sleep(300);
  if (!(await ev(`return !document.getElementById('m-intro').hidden`))) { await ev(`abrirIntro('${M.id}')`); await sleep(300); }
  log("  intro:", await ev(`return document.getElementById('mi-title').textContent`));
  await ev(`document.getElementById('mi-go').click()`); await sleep(2200);
  log("  altares:", await acenderTodos());
  // tentar terminar sem derrotar o mestre
  await ir(M.fim); await sleep(500);
  const arena = await ev(`const s=cena(); return {ativo: s.chefeAtivo, barra: !document.getElementById('boss').hidden, nome: document.getElementById('boss-nome').textContent, aviso: document.getElementById('toast').textContent.slice(0,60)}`);
  ok(arena.ativo && arena.barra, `entrar na arena ativa o mestre e mostra a barra (${arena.nome})`);
  await ir(M.fim); await sleep(400);
  ok((await ev(`return document.getElementById('scr-result').hidden`)) === true, "não dá para terminar sem derrotar o mestre");
  // deixa o mestre lutar por 7 s, com o jogador perto dele
  await ev(`const s=cena(); s.vida=5; s.atualizarHUD(); window._viu=false; s.player.setPosition(s.chefe.x-150, 440);`);
  let viu = false;
  for (let i = 0; i < 70 && !viu; i++) { viu = await ev(`const s=cena(); ${M.comportamento}`); await sleep(100); }
  await sleep(1500);
  const luta = await ev(`const s=cena(); return {vida: s.vida, derrota: !document.getElementById('m-defeat').hidden, frames: game.loop.frame}`);
  ok(viu, `${M.nome} executa o ataque característico`);
  ok(luta.vida < 5 || luta.derrota, `${M.nome} causa dano (vida ${luta.vida})`);
  if (luta.derrota) { await ev(`document.getElementById('md-resume').click()`); await sleep(1500); }
  await shot(`c-${M.id}-mestre`);
  // derrota o mestre a golpes (com o jogador invulnerável)
  const golpes = await ev(`const s=cena(); const esp=(ms)=>new Promise(r=>setTimeout(r,ms)); let n=0;
    for (let i=0;i<40 && s.chefe && s.chefe.active && !s.run.concluidos.has('chefe');i++){ s.invuln=600; s.vida=5; s.atkCd=0; s.player.setPosition(s.chefe.x-40, s.chefe.y); s.facing=1; s.atacar(); n++; await esp(300); }
    return {golpes:n, derrotado: s.run.concluidos.has('chefe'), barra: !document.getElementById('boss').hidden}`);
  ok(golpes.derrotado && !golpes.barra, `${M.nome} derrotado em ${golpes.golpes} golpes; barra some`);
  await sleep(800);
  const r = await concluir(M.fim);
  log("  resultado:", JSON.stringify(r));
  ok(r.pts !== undefined && Number(r.pts) > 0, "missão concluída após derrotar o mestre");
  log("  quadro:", await ev(`return [...document.querySelectorAll('#r-breakdown tr')].map(t=>t.textContent).join(' | ')`));
}
// ---------- Prova final ----------
log("\n[Prova final]");
ok((await ev(`return document.getElementById('r-next').textContent`)) === "Ir para a prova final", "depois da Missão 7, o botão leva à prova final");
await ev(`document.getElementById('r-next').click()`); await sleep(400);
ok(!(await ev(`return document.getElementById('scr-prova').hidden`)), "tela da prova abre com as regras");
const comp = await ev(`const qs=montarProva(); const t=new Set(qs.map(q=>q.tema)); let princ=0; for(let n=1;n<=15;n++) if(t.has(n+'º Princípio')) princ++;
  return {n: qs.length, princ, dif: qs.filter(q=>q.nivel==='dificil').length, todasManifesto: qs.every(q=>q.modulo==='manifesto'), unicas: new Set(qs.map(q=>q.id)).size}`);
ok(comp.n === 20 && comp.princ === 15 && comp.dif >= 8 && comp.todasManifesto && comp.unicas === 20, "sorteio: 20 únicas do manifesto, 15 princípios, ≥8 difíceis " + JSON.stringify(comp));
const responderProva = (certo) => ev(`const esp=(ms)=>new Promise(r=>setTimeout(r,ms));
  for (let k=0;k<25 && PROVA;k++){ await esp(520); const q=PROVA.qs[PROVA.i]; const pos=PROVA.ordem.findIndex(o=>${certo ? "o.idx===q.correta" : "o.idx!==q.correta"});
    document.getElementById('pv-opts').children[pos].click(); await esp(60); document.getElementById('pv-ok').click(); }
  await esp(400); return {nota: document.getElementById('pv-nota').textContent, veredito: document.getElementById('pv-veredito').textContent, revisao: document.querySelectorAll('#pv-revisao details').length}`);
await ev(`document.getElementById('pv-start').click()`); await sleep(300);
const semFeedback = await ev(`return document.querySelectorAll('#pv-opts .right, #pv-opts .wrong').length === 0 && !document.getElementById('pv-ok').disabled === false`);
ok(semFeedback, "durante a prova não há resposta na hora e é preciso escolher antes de confirmar");
const pr1 = await responderProva(false);
ok(pr1.nota === "0%" && pr1.veredito.startsWith("Ainda não") && pr1.revisao === 20, "reprovação: nota, veredito e revisão das 20 " + JSON.stringify(pr1));
await shot("c09-prova-reprovado");
await ev(`document.getElementById('pv-res-back').click()`); await sleep(300);
const bloqueio = await ev(`abrirProva(); return {botao: document.getElementById('pv-start').disabled, aviso: document.getElementById('pv-espera').textContent}`);
ok(bloqueio.botao && bloqueio.aviso.includes("Nova tentativa"), "nova tentativa bloqueada pelo intervalo: " + bloqueio.aviso);
ok((await ev(`return patenteIndex(PERFIL)`)) < 7, "reprovado não recebe a patente máxima");
await ev(`PARAMS.prova.intervaloHoras = 0; abrirProva();`); await sleep(200);
await ev(`document.getElementById('pv-start').click()`); await sleep(300);
const pr2 = await responderProva(true);
ok(pr2.nota === "100%" && pr2.veredito === "Aprovado.", "aprovação com 100% " + JSON.stringify(pr2));
const promoProva = await ev(`return document.getElementById('pv-promo').textContent`);
ok(promoProva.includes("Cavaleiro do Farol"), "aprovação concede a patente Cavaleiro do Farol");
await shot("c10-prova-aprovado");
await ev(`document.getElementById('pv-res-back').click()`); await sleep(300);
await ev(`document.getElementById('r-central').click()`); await sleep(500);
log("\ncentral final:", await ev(`return {patente: document.getElementById('c-patente').textContent, xp: document.getElementById('c-xp').textContent, pts: document.getElementById('c-pts').textContent, missoes: [...document.querySelectorAll('.mission .act')].slice(0,5).map(a=>a.textContent).join(' | ')}`));
await shot("c08-central");

log("\nLOGS:", logs.length ? logs.join(" || ") : "nenhum erro");
ws.close(); proc.kill(); process.exit(0);
