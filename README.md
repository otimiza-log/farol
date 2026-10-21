# Farol da Liberdade: jogo de formação de Faroleiros

Jogo 2D de plataforma para navegador com quiz, para formar **Faroleiros**: o jogador atravessa ruínas pós-apocalípticas, enfrenta saqueadores e acende pilares respondendo perguntas sobre o Manifesto Conservador do Farol da Liberdade, até chegar ao Farol.

Versão atual: **Prólogo + Missões 1 a 6**, com quiz, XP, patentes, ranking e três **mestres** de fim de fase. A Missão 7 e a prova final vêm depois.

| Missão | Princípios no quiz | Novidade de jogabilidade |
|---|---|---|
| 0. Prólogo: A Névoa | Identidade e valores | Tutorial, boneco de treino, Pedra do Juramento |
| 1. Os Três Pilares | Introdução, 1º e 2º | Saqueadores, buracos, pergaminhos opcionais |
| 2. A Forja das Virtudes | 3º, 5º, 6º e 11º | **Fanáticos** (investem forte e ficam atordoados), **brasas** que queimam, **plataformas móveis**, martelos opcionais |
| 3. Vila da Fraternidade | 4º, 7º e 12º | **Aliciadores** (atiram promessas que dá para rebater), **moradores caídos** que você ajuda a levantar e que devolvem vida |
| 4. Terras Confiscadas | 8º, 10º e 14º | Burocratas armados, arame farpado, escrituras opcionais. **Mestre: Cria de Deodoro** (golpe de bastão prussiano com alcance longo, salto que solta ondas de poeira pelo chão; fica tonto depois do golpe) |
| 5. O Mercado das Mentiras | 6º, 9º e 15º | Ilusionistas, plataformas móveis, microfones opcionais. **Mestre: Bolsolepra** (zumbi de verde e amarelo que cospe gosmas de mentira em leque, 3 e depois 5; fica ofegante depois de cuspir) |
| 6. A Cidade sem Lei | 13º e Conexões | Capangas, barricadas em chamas, provas opcionais. **Mestre: Luladrão** (molusco mascarado que faz chover propina, com sombra de aviso no chão, e investe de parede a parede; fica tonto depois da investida) |

**Mestres:** ao entrar na arena, a câmera tranca, aparece a barra de vida e o ponto de controle passa para a entrada da arena. Na metade da vida, o mestre fica mais rápido e agressivo. Derrotá-lo vale 300 pontos e 200 XP e é obrigatório para terminar a fase.

**Quiz à prova de toque acidental:** o quiz abre numa tela de confirmação. Cada etapa ignora teclas por um instante, teclas mantidas apertadas (como D ou Espaço) são ignoradas e só as teclas 1 a 4 respondem.

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
testes/
  campanha.mjs                        Joga do Prólogo à Missão 6 (mestres incluídos) e confere as mecânicas
  celular.mjs                         Testa toque, celular em pé/deitado e o quiz em tela baixa
```

## Como jogar

Abra `jogo/index.html` no navegador, ou sirva a pasta `jogo/` num servidor web (veja "Publicar na VPS").

- **Computador:** ← → ou A/D para andar, Espaço ou W para pular, J para atacar, Esc para pausar. No quiz, Enter abre a pergunta e avança, e as teclas 1 a 4 escolhem a alternativa.
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

Os temas usados por cada missão ficam em `FASES` (no template) e a lista de temas incluídos no jogo, em `TEMAS` (no `build_jogo.py`). Os parâmetros de pontuação, XP, patentes e fases ficam no início do script em `jogo/farol-template.html` (`PARAMS`, `PATENTES`, `CAMPANHA`, `FASES`).

## Regras implementadas

- **Quiz:** resposta certa vale o valor-base (fácil 20, médio 40, difícil 60). Errada vale 25% do valor-base e mostra a explicação. Errar não trava a missão.
- **Missão:** objetivo principal vale 200, cada objetivo opcional 50, cada inimigo 5 (até 100 por missão).
- **Ranking:** soma o melhor resultado de cada missão e é separado do XP. Desempate: mais opcionais, depois menor tempo.
- **XP e patentes:** são 8 patentes (Sujeito Desconfiado → Cavaleiro do Farol), definidas por XP mínimo e missão concluída. Repetir uma missão rende 20% do XP.
- **Derrota:** dá para retomar do último ponto de controle sem ganhar a mesma recompensa duas vezes.
- **Modo sério:** desliga os comentários cômicos do quiz.

## Testes automatizados

Os testes abrem o jogo num Chrome sem janela (headless) e jogam sozinhos. Precisam de Node 22 ou mais novo e de Google Chrome instalado.

```bash
node testes/campanha.mjs jogo/index.html saida-testes "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

```bash
node testes/celular.mjs jogo/index.html saida-testes "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

Cada linha `OK`/`FALHA` é uma verificação, e as capturas de tela ficam em `saida-testes/`. No Linux, troque o caminho do Chrome (por exemplo, `/usr/bin/google-chrome`).

## Limitações conhecidas

- **Pontuação calculada no navegador.** A especificação exige validação no servidor (RN-022), idempotência por evento e um painel administrativo. Isso depende de um backend, previsto na arquitetura técnica (TAD), com Supabase sugerido.
- A Missão 7 e a prova final ainda não existem e aparecem como "Em breve".
- A especificação v1.1 (§2.3) ainda lista 7 patentes. A tabela vigente, com 8, está em `docs/avaliacao-especificacao-v1.1.md` (§4.3).

## Próximos passos

1. Especificação de Arquitetura Técnica (TAD): backend, modelo de dados, API de eventos e antifraude.
2. Painel administrativo de perguntas, com os campos `versao`, `status` e `revisado_por`.
3. Missão 7 (A Travessia) e a prova final.
