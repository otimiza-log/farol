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

const responderTudo = async () => ev(`
  for (let n = 0; n < 6; n++) {
    if (document.getElementById('m-quiz').hidden) break;
    const q = BANCO.find(b => b.pergunta === document.getElementById('mq-q').textContent);
    [...document.getElementById('mq-opts').children].find(o => Number(o.dataset.idx) === q.correta).click();
    await new Promise(r => setTimeout(r, 150));
    document.getElementById('mq-next').click();
    await new Promise(r => setTimeout(r, 250));
  }
  return document.getElementById('m-quiz').hidden;`);
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
await ir(1720); await sleep(600); await responderTudo(); await sleep(300);
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
// morador: +1 de vida
await ev(`const s=cena(); s.vida=3; s.atualizarHUD();`);
await ir(620, 440); await sleep(400);
const mor = await ev(`const s=cena(); return {vida:s.vida, ajudado: s.moradores.getChildren()[0].getData('ajudado'), toast: document.getElementById('toast').textContent}`);
ok(mor.vida === 4 && mor.ajudado, "morador reerguido devolve 1 de vida: " + mor.toast);
await shot("c06-morador");
log("  lugares:", await acenderTodos());
for (const x of [1380, 2280, 3700]) { await ir(x, 440); await sleep(350); }
log("  objetivo HUD:", await ev(`return document.getElementById('h-obj').textContent`));
const r3 = await concluir(4670);
log("  resultado:", JSON.stringify(r3));
await shot("c07-resultado-m3");
await ev(`document.getElementById('r-central').click()`); await sleep(500);
log("\ncentral final:", await ev(`return {patente: document.getElementById('c-patente').textContent, xp: document.getElementById('c-xp').textContent, pts: document.getElementById('c-pts').textContent, missoes: [...document.querySelectorAll('.mission .act')].slice(0,5).map(a=>a.textContent).join(' | ')}`));
await shot("c08-central");

log("\nLOGS:", logs.length ? logs.join(" || ") : "nenhum erro");
ws.close(); proc.kill(); process.exit(0);
