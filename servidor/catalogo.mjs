// Catálogo do jogo: o servidor lê as MESMAS regras que o jogo usa (PARAMS, PATENTES, CAMPANHA, FASES),
// direto do template, e as perguntas direto de conteudo/. Assim não existe uma segunda cópia para manter.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export function carregarCatalogo(raiz) {
  const tpl = fs.readFileSync(path.join(raiz, "jogo", "farol-template.html"), "utf8");
  const ini = tpl.indexOf("const PARAMS = {");
  const iniFases = tpl.indexOf("const FASES = {");
  const fim = tpl.indexOf("/* =====", iniFases);
  if (ini < 0 || iniFases < 0 || fim < 0) throw new Error("Não encontrei PARAMS/FASES no template do jogo.");
  const codigo = tpl.slice(ini, fim) + "\n;({ PARAMS, PATENTES, CAMPANHA, FASES })";
  const { PARAMS, PATENTES, CAMPANHA, FASES } = vm.runInNewContext(codigo, Object.create(null), { timeout: 1000 });

  const ler = (nome) => JSON.parse(fs.readFileSync(path.join(raiz, "conteudo", nome), "utf8"));
  const lista = [
    ...ler("quiz-faroleiros.json").perguntas.map((q) => ({ ...q, modulo: "manifesto" })),
    ...ler("quiz-cultura-faroleira.json").perguntas.map((q) => ({ ...q, tema: "Cultura · " + q.tema, modulo: "cultura" }))
  ].map((q) => ({ ...q, chave: String(q.id), versao: q.versao || 1 }));
  const perguntas = new Map(lista.map((q) => [q.chave, q]));
  if (perguntas.size !== lista.length) throw new Error("Há perguntas com id repetido em conteudo/.");
  return { PARAMS, PATENTES, CAMPANHA, FASES, perguntas, lista };
}

// Altares de uma fase, com a mesma chave que o jogo usa ("pedra" no Prólogo, "altar0", "altar1"... nas demais)
export function altaresDe(F) {
  if (F.pedra) return [{ chave: "pedra", ...F.pedra }];
  return (F.altares || []).map((a, i) => ({ chave: `altar${i}`, ...a }));
}
