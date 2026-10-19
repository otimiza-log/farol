# Farol da Liberdade: jogo de formação de Faroleiros

Jogo 2D de plataforma para navegador com quiz, para formar **Faroleiros**: o jogador atravessa ruínas pós-apocalípticas, enfrenta saqueadores e acende pilares respondendo perguntas sobre o Manifesto Conservador do Farol da Liberdade, até chegar ao Farol.

Esta versão é uma **fatia vertical** (Prólogo + Missão 1 + quiz + ranking), feita para validar o ciclo central descrito na *Especificação Funcional v1.1*.

## Estrutura

```
docs/
  fundamentos-farol-da-liberdade.md   Fundamentos e os 15 princípios do manifesto (base do quiz)
  estudo-canais-farol.md              Estudo dos canais (YouTube, Instagram, X): doutrina falada
  avaliacao-especificacao-v1.1.md     Avaliação da especificação, campanha, parâmetros e patentes
conteudo/
  quiz-faroleiros.json / .md          Módulo Manifesto: 75 perguntas
  quiz-cultura-faroleira.json / .md   Módulo Cultura Faroleira: 40 perguntas
  quiz-mensagens.json                 Mensagens de acerto, erro, sequência e títulos
jogo/
  farol-template.html                 Código do jogo (Phaser 3, HTML/CSS/JS num arquivo)
  build_jogo.py                       Injeta as perguntas no template
  index.html                          Jogo pronto para servidores (VPS) e para abrir direto no navegador
  farol-da-liberdade.html             Jogo pronto para publicar como artefato do claude.ai
```

## Como jogar

Abra `jogo/index.html` no navegador, ou sirva a pasta `jogo/` num servidor web (veja "Publicar na VPS").

- **Computador:** ← → ou A/D para andar, Espaço ou W para pular, J para atacar, Esc para pausar. No quiz, as teclas 1 a 4 escolhem a alternativa.
- **Celular:** o jogo detecta a tela de toque e mostra botões sobrepostos (◀ ▶, PULO, ATAQUE). Feito para a tela **na horizontal**: na vertical, aparece um aviso para girar (com a opção de jogar assim mesmo). No Android, ao começar a missão, o jogo entra em tela cheia e trava na horizontal. Ao levar dano, o celular vibra.

Aberto fora do claude.ai, o jogo roda em **modo local**: o progresso fica só no navegador e não há ranking online. A versão publicada como artefato do claude.ai salva o progresso na conta e mantém o ranking compartilhado.

## Publicar na VPS

O jogo é estático: basta servir a pasta `jogo/` com o arquivo de índice `index.html`. Exemplo com Caddy (porta 8085):

```
http://:8085 {
	root * /var/www/farol/jogo
	@bloqueado path *.py *.md /farol-template.html
	respond @bloqueado 404
	file_server {
		index index.html
	}
}
```

Para atualizar: `git -C /var/www/farol pull --ff-only` (sem reiniciar o servidor).

## Como alterar perguntas

1. Edite os JSONs em `conteudo/`. Cada pergunta tem `id`, `tema`, `nivel` (`facil`, `medio` ou `dificil`), `pergunta`, `alternativas` (4), `correta` (índice de 0 a 3), `explicacao` e `zoeira` (comentário cômico opcional).
2. Gere o jogo de novo:

```bash
python jogo/build_jogo.py
```

Nesta fatia, o jogo usa os temas *Identidade*, *Introdução*, *1º Princípio* e *2º Princípio*. Os parâmetros de pontuação, XP, patentes e fases ficam no início do script em `jogo/farol-template.html` (`PARAMS`, `PATENTES`, `CAMPANHA`, `FASES`).

## Regras implementadas

- **Quiz:** resposta certa vale o valor-base (fácil 20, médio 40, difícil 60). Errada vale 25% do valor-base e mostra a explicação. Errar não trava a missão.
- **Missão:** objetivo principal vale 200, cada objetivo opcional 50, cada inimigo 5 (até 100 por missão).
- **Ranking:** soma o melhor resultado de cada missão e é separado do XP. Desempate: mais opcionais, depois menor tempo.
- **XP e patentes:** são 8 patentes (Sujeito Desconfiado → Cavaleiro do Farol), definidas por XP mínimo e missão concluída. Repetir uma missão rende 20% do XP.
- **Derrota:** dá para retomar do último ponto de controle sem ganhar a mesma recompensa duas vezes.
- **Modo sério:** desliga os comentários cômicos do quiz.

## Limitações conhecidas

- **Pontuação calculada no navegador.** A especificação exige validação no servidor (RN-022), idempotência por evento e um painel administrativo. Isso depende de um backend, previsto na arquitetura técnica (TAD), com Supabase sugerido.
- Missões 2 a 7 e a prova final ainda não existem e aparecem como "Em breve".
- A especificação v1.1 (§2.3) ainda lista 7 patentes. A tabela vigente, com 8, está em `docs/avaliacao-especificacao-v1.1.md` (§4.3).

## Próximos passos

1. Especificação de Arquitetura Técnica (TAD): backend, modelo de dados, API de eventos e antifraude.
2. Painel administrativo de perguntas, com os campos `versao`, `status` e `revisado_por`.
3. Missões 2 a 7 e a prova final.
