// Regras do jogo calculadas no servidor (espelham as do template, mas aqui é que valem).
import crypto from "node:crypto";

const aleatorio = (n) => crypto.randomInt(n);
export const embaralhar = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = aleatorio(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const sortearUm = (arr) => (arr.length ? arr[aleatorio(arr.length)] : undefined);

// mesma lógica do jogo: pelo menos 1 fácil, o resto misturado, sem repetir na mesma partida
export function sortearPerguntas(lista, temas, qtd, usadas) {
  let pool = lista.filter((q) => temas.includes(q.tema) && !usadas.has(q.chave));
  if (pool.length < qtd) pool = lista.filter((q) => temas.includes(q.tema));
  const faceis = embaralhar(pool.filter((q) => q.nivel === "facil"));
  const outras = embaralhar(pool.filter((q) => q.nivel !== "facil"));
  const sel = [];
  if (faceis.length) sel.push(faceis.shift());
  const resto = embaralhar(outras.concat(faceis));
  while (sel.length < qtd && resto.length) sel.push(resto.shift());
  return sel;
}

// prova final: 1 por princípio, mínimo de difíceis, completa até o total, só Manifesto
export function montarProva(lista, P) {
  const man = lista.filter((q) => q.modulo === "manifesto");
  const sel = [], usados = new Set();
  const add = (q) => { if (q && !usados.has(q.chave)) { usados.add(q.chave); sel.push(q); } };
  for (let n = 1; n <= 15; n++) add(sortearUm(man.filter((q) => q.tema === `${n}º Princípio`)));
  const dif = () => sel.filter((q) => q.nivel === "dificil").length;
  for (const q of embaralhar(man.filter((q) => q.nivel === "dificil"))) { if (dif() >= P.dificeisMin || sel.length >= P.questoes) break; add(q); }
  for (const q of embaralhar(man)) { if (sel.length >= P.questoes) break; add(q); }
  return embaralhar(sel).slice(0, P.questoes);
}

export function patenteIndex(PATENTES, xp, concluidas, provaAprovada) {
  let idx = 0;
  PATENTES.forEach((pt, i) => {
    if (pt.xp === null) { if (concluidas.has("final") && provaAprovada) idx = i; return; }
    if (xp >= pt.xp && (!pt.req || concluidas.has(pt.req))) idx = i;
  });
  return idx;
}

export function pontosDaPergunta(PARAMS, q, ok) {
  const base = PARAMS.valorBase[q.nivel] || 20;
  return ok ? base : Math.round(base * PARAMS.fatorErro);
}

// valida um evento de jogo contra a fase: só ids que existem; devolve linha, pontos e xp (ou null se inválido)
export function avaliarEvento(PARAMS, F, evento) {
  const m = /^(inimigo|col|mor):(\d{1,3})$/.exec(evento);
  if (m) {
    const i = Number(m[2]);
    if (m[1] === "inimigo") return i < (F.inimigos || []).length ? { linha: "inimigos", pontos: PARAMS.inimigo, xp: PARAMS.xp.inimigo } : null;
    if (m[1] === "col") return F.coletaveis && i < F.coletaveis.pos.length ? { linha: "opcionais", pontos: PARAMS.objetivoOpcional, xp: PARAMS.xp.objetivoOpcional } : null;
    if (m[1] === "mor") return F.moradores && i < F.moradores.length ? { linha: "opcionais", pontos: PARAMS.objetivoOpcional, xp: PARAMS.xp.objetivoOpcional } : null;
  }
  if (evento === "chefe") return F.chefe ? { linha: "chefe", pontos: PARAMS.chefe, xp: PARAMS.xp.chefe } : null;
  if (evento === "boneco") return F.boneco ? { linha: "objetivos", pontos: 0, xp: 0 } : null;
  return null;
}

// filtro de apelido (o mesmo do jogo)
const PROIBIDAS = ["porra", "caralho", "merda", "puta", "buceta", "viado", "foder", "fdp", "arrombad", "nazi", "hitler"];
export function validarApelido(a) {
  const s = String(a || "").trim();
  if (s.length < 3 || s.length > 16) return "O apelido deve ter de 3 a 16 caracteres.";
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(s)) return "Use só letras, números, espaço, ponto, hífen ou sublinhado.";
  const low = s.toLowerCase() + " ";
  if (PROIBIDAS.some((p) => low.includes(p))) return "Escolha outro apelido. Este não pode aparecer no ranking.";
  return "";
}
