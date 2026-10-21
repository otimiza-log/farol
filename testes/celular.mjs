// Teste de celular (toque real via CDP) sobre jogo/index.html
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const [, , htmlPath, outDir, chrome] = process.argv;
mkdirSync(outDir, { recursive: true });
const port = 9337;
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "farol-e2e-mob")}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
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
const tela = (w, h) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: w > h ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 } });
const centro = async (sel) => ev(`const r=document.querySelector('${sel}').getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}`);
const toque = async (sel, ms) => { const c = await centro(sel); await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y, id: 1 }] }); await sleep(ms); await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); };
const st = `const s=cena(); const c=game.canvas; return {x:Math.round(s.player.x), vy:Math.round(s.player.body.velocity.y), pausado:s.pausado, canvas:c.style.width+'x'+c.style.height, touch:getComputedStyle(document.getElementById('touch')).display, girar:!document.getElementById('rotate').hidden, docW:document.documentElement.scrollWidth, vw:innerWidth}`;

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });

// ---- celular em pé: telas fora do jogo ----
await tela(390, 844);
await send("Page.navigate", { url: "file:///" + htmlPath.replace(/\\/g, "/") });
await sleep(3500);
log("touchmode automatico:", await ev(`return document.body.classList.contains('touchmode') + ' | largura doc ' + document.documentElement.scrollWidth + ' vs ' + innerWidth`));
await shot("m01-home-retrato");
await ev(`document.getElementById('in-apelido').value='Faroleiro_Mobile'; document.getElementById('form-signin').requestSubmit();`);
await sleep(1200); await shot("m02-central-retrato");
await ev(`abrirIntro('m0')`); await sleep(400); await shot("m03-intro-retrato");
await ev(`document.getElementById('mi-go').click()`); await sleep(2500);
log("jogo em pé:", await ev(st));
await shot("m04-jogo-retrato-aviso");

// ---- gira para deitado ----
await tela(844, 390); await sleep(1200);
log("deitado:", await ev(st));
await shot("m05-jogo-paisagem");
const x0 = (await ev(st)).x;
await toque('#touch [data-k="right"]', 800);
const s1 = await ev(st); log("toque ▶ andou:", s1.x - x0, "px");
await toque('#touch [data-k="jump"]', 80); await sleep(60);
log("toque PULO vy:", (await ev(st)).vy);
await sleep(900);
// boneco com toque no ATAQUE
await ev(`const s=cena(); s.player.setPosition(975,440); s.facing=1; s.player.setFlipX(false)`); await sleep(300);
for (let i = 0; i < 3; i++) { await toque('#touch [data-k="attack"]', 60); await sleep(380); }
log("boneco derrotado por toque:", await ev(`return cena().run.concluidos.has('boneco')`));
// quiz em tela baixa
await ev(`const s=cena(); s.player.setPosition(1700,430)`); await sleep(800);
await shot("m06-quiz-paisagem");
await ev(`const opts=[...document.getElementById('mq-opts').children]; opts[0].click();`); await sleep(300);
log("quiz cabe/rola:", await ev(`const m=document.getElementById('m-quiz'); const b=document.getElementById('mq-next'); b.scrollIntoView({block:'nearest'}); const r=b.getBoundingClientRect(); return {modalAltura:m.clientHeight, conteudo:m.scrollHeight, botaoVisivel: r.bottom<=innerHeight && r.top>=0}`));
await shot("m07-quiz-feedback-paisagem");
await ev(`for (let i=0;i<3;i++){ const b=document.getElementById('mq-next'); if(!b.hidden){ b.click(); await new Promise(r=>setTimeout(r,250)); const o=document.getElementById('mq-opts').children[0]; if(o && !document.getElementById('m-quiz').hidden && document.getElementById('mq-next').hidden) { o.click(); await new Promise(r=>setTimeout(r,200)); } } }`);
await sleep(500);
log("após quiz:", await ev(`return {quizAberto: !document.getElementById('m-quiz').hidden, pausado: cena().pausado}`));

// ---- volta para em pé: deve pausar com aviso; "jogar na vertical" libera ----
await tela(390, 844); await sleep(1000);
log("em pé de novo:", await ev(st));
await ev(`document.getElementById('btn-portrait').click()`); await sleep(800);
log("jogar na vertical:", await ev(st));
await shot("m08-jogo-retrato-liberado");

log("LOGS:", logs.length ? logs.join(" || ") : "nenhum erro");
ws.close(); proc.kill(); process.exit(0);
