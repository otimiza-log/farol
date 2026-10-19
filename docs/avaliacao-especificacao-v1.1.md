# Avaliação e Complemento: Especificação Funcional v1.1

> Documento avaliado: *Farol da Liberdade – Especificação Funcional do Jogo v1.1* (19/10/2026), mais a prancha visual *Jornada Templária*.
> Compara a especificação com o conteúdo já produzido ([fundamentos](fundamentos-farol-da-liberdade.md), [estudo dos canais](estudo-canais-farol.md), [quiz Manifesto](../conteudo/quiz-faroleiros.json), [quiz Cultura](../conteudo/quiz-cultura-faroleira.json) e [mensagens](../conteudo/quiz-mensagens.json)) e propõe o que falta para fechar o escopo antes da arquitetura técnica (TAD).

---

## 1. Diagnóstico geral

**A especificação é boa.** Os requisitos são verificáveis, as regras de negócio têm IDs, há critérios de aceite e o documento se preocupa com integridade: validação no servidor, idempotência, separação entre XP e ranking.

**Mas ela muda o tamanho do que vamos criar.** Até aqui planejávamos um **quiz jogável numa página**. A especificação descreve um **jogo 2D de plataforma com backend**: contas, campanha, combate, XP, patentes, ranking online, painel administrativo e auditoria. O quiz deixa de ser o produto e vira **um dos sistemas** do jogo.

| Item | Situação |
|---|---|
| Conteúdo do quiz (115 perguntas, feedback educativo) | ✅ Pronto. Atende RF-QUIZ-01/02 e §16 ("incorporar o Markdown do quiz") |
| Tom e mensagens (acerto, erro, títulos) | ⚠️ Pronto, mas **conflita** com o tom cinematográfico da §2.1 e com as patentes (ver §3) |
| Narrativa da campanha (missões, fases, inimigos) | ❌ **Não existe** na especificação nem no nosso material |
| Fórmulas de pontuação, XP e limiares de patente | ❌ Ficaram "a confirmar" (§14). Proposta abaixo |
| Prova final (composição, nota, tentativas) | ❌ Só há regras gerais. Proposta abaixo |
| Governança de conteúdo (quem revisa e publica perguntas) | ❌ Citada (RN-009) mas não definida |
| Privacidade e LGPD (cadastro público) | ❌ Ausente |

---

## 2. O que a especificação já cobre bem
- **Separação entre XP, pontuação competitiva e patente** (RN-013, §8.1), com critérios de aceite específicos (CA-13).
- **Errar não trava** a missão, mas rende menos (RN-015/016). Bom para um jogo de formação: o jogador aprende com a explicação.
- **Prova final obrigatória** para a patente máxima, com o progresso preservado em caso de reprovação (RN-020/021, CA-18 a 21).
- **Versionamento das perguntas** (RF-QUIZ-04, RN-006). Essencial, porque o módulo Cultura muda com o tempo.
- **Escopo do MVP** bem delimitado (§3.2 fora do MVP).

---

## 3. Inconsistências e lacunas encontradas

### 3.1 Prancha visual × especificação × manifesto
| Elemento na prancha | Problema | Recomendação |
|---|---|---|
| **Moedas (🪙 245)** no HUD | A especificação tira economia e loja do MVP (§3.2) e não define moeda | Trocar por **pontuação da missão** ou remover |
| **"Nível 3"** no HUD | A especificação usa **patente** e **XP**, não "nível" | Mostrar a patente atual e a barra de XP |
| **"Tempo 02:15"** no resultado | A especificação só usa tempo como **desempate** e não diz se o quiz tem cronômetro | Decidir: tempo só informativo (recomendado) ou parte da pontuação |
| **Quiz sobre as Cruzadas** | Não há perguntas de **História/Templários** no banco | Criar um módulo **"História e Símbolos"** (Templários, *Non nobis Domine*, virtudes cardeais na história) ou trocar o exemplo |
| **Quatro valores: Fé, Disciplina, Conhecimento, Liberdade** | Diferentes dos **4 valores oficiais** do manifesto (Liberdade, Valores tradicionais, Racionalidade, Defesa das minorias) | Ou usar os 4 oficiais, ou tratá-los explicitamente como **atributos do jogo**. Do contrário o jogo ensina uma lista errada, e o quiz cobra a certa (perguntas 2 e 3) |
| **Cruz templária vermelha** na identidade | Coerente com o lema templário de Abraham | Validar com o movimento o uso de símbolo religioso e militar na marca |

### 3.2 Tom
- A especificação pede um tom **"humano, realista, contemporâneo e cinematográfico"** (Templários + Mad Max).
- O quiz agora tem **humor ácido**.
- **Recomendação:** os dois convivem se o humor ficar **só no comentário pós-resposta (`zoeira`)**, com uma **opção nas configurações** para desligar ("Modo sério"). A pergunta e a `explicacao` continuam sóbrias, e a prova final usa **sempre o modo sério**.

### 3.3 Patentes × títulos de pontuação
- [quiz-mensagens.json](../conteudo/quiz-mensagens.json) tem títulos cômicos por faixa de acerto ("Vela de Aniversário" … "Faroleiro").
- A especificação tem **7 patentes oficiais** ("Membro do Canal" … "Cavaleiro do Farol").
- **Risco:** confundir o jogador ao exibir "Faroleiro" como título de quiz enquanto a patente oficial é outra.
- **Recomendação:** renomear os títulos cômicos para **"Desempenho na rodada"** e tirar a palavra "Faroleiro" deles. A última faixa pode virar "Farol Aceso".

### 3.4 Conteúdo sobre pessoas reais
- O módulo Cultura cita pessoas reais (Bolsonaro, Lula, Olavo, Nikolas, ministros do STF).
- O 15º Princípio do próprio manifesto condena afirmações que prejudiquem a imagem de alguém **sem fatos**.
- **Recomendações:**
  - Inimigos do jogo devem ser **arquétipos genéricos** ("o Burocrata", "o Ilusionista", "o Fanático"), **nunca caricaturas de pessoas reais**. Isso reduz o risco jurídico e mantém a coerência com o 15º Princípio.
  - Perguntas com nomes reais (C7, C35, C38, C39) devem receber a marcação `sensivel: true` e exigir **dupla revisão** antes de publicar (RN-009).

### 3.5 Lacunas não cobertas pela especificação
1. **Privacidade e LGPD:** o cadastro é público. Faltam política de privacidade, base legal e consentimento, exclusão de conta, **idade mínima** (e o que fazer com menores) e quais dados aparecem no ranking (RN-011 cita o tema, mas não define).
2. **Governança de conteúdo:** RN-009 exige validação antes de publicar, mas não diz **quem valida** nem com que fluxo.
3. **Narrativa:** a especificação fala em "jornada em busca da verdade até o Farol na ilha", mas não traz roteiro, missões, personagens nem inimigos.
4. **Acessibilidade do quiz:** o quiz deve ser jogável **só pelo teclado** e legível em telas pequenas (quatro alternativas longas no celular).
5. **Moderação do ranking:** apelidos ofensivos no ranking público precisam de filtro e de denúncia.
6. **Modo convidado:** pode jogar sem conta? A especificação exige conta (fluxo §12). Uma **demo sem conta** da primeira missão aumentaria a conversão.

---

## 4. Complementos propostos

### 4.1 Campanha "Jornada até o Farol" (proposta de roteiro do MVP)

Um prólogo, sete missões e a prova final. Cada missão corresponde a um bloco de princípios do manifesto, e as patentes acompanham o avanço.

| # | Missão | Cenário (Templário + pós-apocalíptico) | Conteúdo do quiz | Inimigo-arquétipo | Patente ao concluir* |
|---|---|---|---|---|---|
| 0 | **Prólogo: A Névoa** | Cidade em ruínas, tutorial de mover, pular e atacar | Identidade e os 4 valores | — (tutorial) | Sujeito Desconfiado (ao se cadastrar) → Audiência do YouTube |
| 1 | **Os Três Pilares** | Estrada com três torres: Liberdade, Justiça, Verdade | Introdução, 1º, 2º | Saqueadores | Membro do Canal |
| 2 | **A Forja das Virtudes** | Mosteiro-fortaleza | 3º, 5º, 11º | Fanáticos | Membro do Grupo do Wapp |
| 3 | **Vila da Fraternidade** | Vila de refugiados que se reergue | 4º, 7º, 12º | Aliciadores | — |
| 4 | **Terras Confiscadas** | Fazendas tomadas por um governo local | 8º, 10º, 14º | Burocratas armados | Replicador de Conteúdo |
| 5 | **O Mercado das Mentiras** | Feira de rádios e telões de propaganda | 6º, 9º, 15º | Ilusionistas | Carrega-Bandeira |
| 6 | **A Cidade sem Lei** | Metrópole controlada por cartéis | 13º e corrupção | Corruptos e capangas | — |
| 7 | **A Travessia** | Litoral e barco até a ilha | Cultura Faroleira (dojô, fogueira, Templários) | Tempestade e piratas | Faroleiro Juramentado |
| ★ | **O Farol** | Subida da torre, sem combate | **Prova final** | — | **Cavaleiro do Farol** (se aprovado) |

\*A patente depende de **XP + missão concluída** (§4.3). A tabela mostra onde ela normalmente cai.

### 4.2 Distribuição das perguntas
- **Por missão:** de 6 a 10 perguntas sorteadas do bloco de princípios correspondente, com mistura de níveis (fácil → difícil conforme a campanha avança).
- **Prova final:** **20 perguntas** sorteadas de todo o banco (mínimo de 1 por princípio, 40% difíceis), **sem `zoeira`** e **sem feedback imediato**. O resultado e as explicações aparecem no fim.
- **Banco atual:** 75 (Manifesto) + 40 (Cultura) = 115 perguntas. Dá para o MVP, mas o sorteio da prova final vai repetir perguntas da campanha. **Meta:** 200 ou mais antes do lançamento.

### 4.3 Parâmetros propostos (respondendo à §14)

| Parâmetro | Proposta |
|---|---|
| **Valor-base da questão** | Fácil 20 · Médio 40 · Difícil 60 pontos |
| **Recompensa por erro** | 25% do valor-base (mantém a proposta da especificação) |
| **Objetivo principal da missão** | 200 pontos (uma vez) |
| **Objetivo opcional** | 50 pontos cada (uma vez) |
| **Inimigo derrotado** | 5 pontos, com teto por missão (por exemplo, 100), para evitar farm |
| **Ranking por missão repetida** | Melhor resultado válido por missão (mantém a proposta) |
| **XP** | Mesmos eventos, **pesos próprios**. Repetir uma missão rende 20% do XP e nenhum ponto de ranking a mais |
| **Nota mínima da prova final** | **70%** (14 de 20) |
| **Novas tentativas da prova** | Ilimitadas, com **intervalo de 24 h** e **novo sorteio** de perguntas |
| **Tempo** | Só informativo e critério de desempate. Sem cronômetro no quiz (reduz ansiedade e ajuda a acessibilidade) |

**Patentes (8 níveis, atualizadas em 19/10/2026) e limiares iniciais, configuráveis:**

| Nível | Patente | Tom | XP mínimo | Requisito adicional |
|---|---|---|---|---|
| 1 | Sujeito Desconfiado | Humor | 0 | Conta criada |
| 2 | Audiência do YouTube | Curiosidade | 100 | Prólogo concluído |
| 3 | Membro do Canal | Primeiro vínculo | 300 | Missão 1 concluída |
| 4 | Membro do Grupo do Wapp | Participação | 800 | Missão 2 concluída |
| 5 | Replicador de Conteúdo | Engajamento | 1.500 | Missão 4 concluída |
| 6 | Carrega-Bandeira | Compromisso | 2.300 | Missão 5 concluída |
| 7 | Faroleiro Juramentado | Juramento e disciplina | 3.200 | Missão 7 concluída |
| 8 | Cavaleiro do Farol | Conquista máxima | — | Campanha concluída + prova final ≥ 70% (RN-020) |

> A especificação v1.1 (§2.3) lista 7 patentes, incluindo "Uniformizado". Esta tabela a substitui: entram "Sujeito Desconfiado" e "Audiência do YouTube", e sai "Uniformizado". Atualize a §2.3 na v1.2 da especificação.

### 4.4 Ajustes no formato das perguntas (para RF-QUIZ-04, RN-006, RN-009)

Campos a acrescentar aos JSONs antes de importar no painel administrativo:

| Campo | Para quê |
|---|---|
| `versao` (por pergunta) | Registrar qual versão foi respondida (RN-006) |
| `status` | `rascunho` → `revisado` → `publicado` → `desativado` (RN-009, RF-ADM-01) |
| `modulo` / `categoria` | Manifesto, Cultura, História e Símbolos |
| `principios` | Lista dos princípios cobrados (ex.: `[9, 15]`). Liga a pergunta à missão |
| `uso` | `missao`, `prova_final` ou `ambos` |
| `valor_base` | Derivado do nível, mas sobrescrevível pelo administrador (RF-ADM-02) |
| `fonte` | Link ou trecho de referência (manifesto, episódio e minuto) |
| `sensivel` | Exige dupla revisão (pessoas reais e temas delicados) |
| `revisado_por`, `revisado_em` | Auditoria (RF-SEC-02) |
| `volatil` | Já existe. Liga um lembrete de revisão periódica |
| `zoeira` | Já existe. Opcional, nunca exibida na prova final |

### 4.5 Arquitetura sugerida para a TAD (recomendação)
- **Frontend do jogo:** Phaser 3 + TypeScript (2D lateral, física arcade, controles de toque).
- **Telas fora do jogo** (central, ranking, perfil, admin): web app leve (React ou Svelte).
- **Backend:** Supabase (Postgres + Auth + Row Level Security + Edge Functions). Atende a validação no servidor (RN-022), a idempotência por `event_id` (RN-002), a auditoria e o painel administrativo. Já existe um conector Supabase disponível nesta sessão.
- **Antifraude:** o cliente envia **eventos** ("respondi a pergunta X com a alternativa Y", "derrotei o inimigo Z"), **nunca pontos**. O servidor calcula tudo.

---

## 5. Decisões que dependem de você

1. **Escopo da próxima entrega.** Começar pela **TAD completa** ou por uma **fatia vertical jogável** (Prólogo + Missão 1 + quiz + ranking simples) para validar a sensação do jogo?
2. **Os 4 valores da prancha** (Fé, Disciplina, Conhecimento, Liberdade): manter como atributos do jogo ou trocar pelos 4 oficiais?
3. **Humor:** confirmar o modelo "zoeira opcional, prova final sempre séria".
4. **Módulo "História e Símbolos"** (Templários, Cruzadas, virtudes): criar, já que a prancha usa esse tipo de pergunta?
5. **Pessoas reais:** confirmar a regra "inimigos só como arquétipos" e a dupla revisão das perguntas sensíveis.
6. **Idade mínima e LGPD:** quem do projeto responde por isso?
