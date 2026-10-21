# Farol da Liberdade: jogo de formação de Faroleiros

Jogo 2D de plataforma para navegador com quiz, para formar **Faroleiros**: o jogador atravessa ruínas pós-apocalípticas, enfrenta saqueadores e acende pilares respondendo perguntas sobre o Manifesto Conservador do Farol da Liberdade, até chegar ao Farol.

Versão atual: **campanha completa**, com o Prólogo, as Missões 1 a 7 (quatro com **mestres** de fim de fase) e a **prova final**, que concede a patente máxima, Cavaleiro do Farol. Na VPS, o jogo roda com **servidor próprio**: contas, progresso salvo, pontos conferidos no servidor e ranking real.

| Missão | Princípios no quiz | Novidade de jogabilidade |
|---|---|---|
| 0. Prólogo: A Névoa | Identidade e valores | Tutorial, boneco de treino, Pedra do Juramento |
| 1. Os Três Pilares | Introdução, 1º e 2º | Saqueadores, buracos, pergaminhos opcionais |
| 2. A Forja das Virtudes | 3º, 5º, 6º e 11º | **Fanáticos** (investem forte e ficam atordoados), **brasas** que queimam, **plataformas móveis**, martelos opcionais |
| 3. Vila da Fraternidade | 4º, 7º e 12º | **Aliciadores** (atiram promessas que dá para rebater), **moradores caídos** que você ajuda a levantar e que devolvem vida |
| 4. Terras Confiscadas | 8º, 10º e 14º | Burocratas armados, arame farpado, escrituras opcionais. **Mestre: Cria de Deodoro** (golpe de bastão prussiano com alcance longo, salto que solta ondas de poeira pelo chão; fica tonto depois do golpe) |
| 5. O Mercado das Mentiras | 6º, 9º e 15º | Ilusionistas, plataformas móveis, microfones opcionais. **Mestre: Bolsolepra** (zumbi de verde e amarelo que cospe gosmas de mentira em leque, 3 e depois 5; fica ofegante depois de cuspir) |
| 6. A Cidade sem Lei | 13º e Conexões | Capangas, barricadas em chamas, provas opcionais. **Mestre: Luladrão** (molusco mascarado que faz chover propina, com sombra de aviso no chão, e investe de parede a parede; fica tonto depois da investida) |
| 7. A Travessia | Cultura Faroleira (Faroleiro, conduta, metáforas, religião, identidade) | Água e barcos móveis, lanternas opcionais. **Mestre: Vagabundo do STF** (juiz careca de toga: intimações que perseguem o jogador, martelada com salto e ondas de choque, tarja da censura que varre o chão e precisa ser pulada; fica tonto depois da martelada) |
| ★ Prova final | Manifesto inteiro | 20 perguntas, ao menos 1 de cada princípio e ≥ 40% difíceis. Sem resposta na hora, com revisão completa no fim. Nota mínima 70%. Se reprovar, o progresso fica guardado e há nova tentativa após 24 h. Se aprovar (com a campanha concluída), ganha **Cavaleiro do Farol** |

**Mestres:** ao entrar na arena, a câmera tranca, aparece a barra de vida e o ponto de controle passa para a entrada da arena. Na metade da vida, o mestre fica mais rápido e agressivo. Derrotá-lo vale 300 pontos e 200 XP e é obrigatório para terminar a fase.

**Quiz à prova de toque acidental:** o quiz abre numa tela de confirmação. Cada etapa ignora teclas por um instante, teclas mantidas apertadas (como D ou Espaço) são ignoradas e só as teclas 1 a 4 respondem.

## Estrutura

```
docs/                                 Estudos e avaliação da especificação
conteudo/
  quiz-faroleiros.json / .md          Módulo Manifesto: 75 perguntas
  quiz-cultura-faroleira.json / .md   Módulo Cultura Faroleira: 40 perguntas
  quiz-mensagens.json                 Mensagens de acerto, erro e sequência
jogo/
  farol-template.html                 Código do jogo (Phaser 3, HTML/CSS/JS num arquivo); regras em PARAMS/PATENTES/CAMPANHA/FASES
  build_jogo.py                       Gera as três versões abaixo a partir do template e de conteudo/
  index.html                          VPS (modo servidor): SEM banco e SEM gabarito; conversa com a API
  offline.html                        Jogo offline, salvo no navegador (contém o gabarito)
  farol-da-liberdade.html             Artefato do claude.ai (contém o gabarito)
servidor/
  iniciar.mjs / app.mjs               Entrada (PM2) e API: contas, sessões, partidas, quiz, ranking e prova final
  banco.mjs / catalogo.mjs / regras.mjs   SQLite, leitura das regras do template, cálculos
  admin.mjs                           Ferramenta do administrador (código de senha, lista de jogadores, backup)
  ecosystem.config.cjs                PM2
  teste/api.test.mjs                  Testes da API
testes/
  campanha.mjs                        Joga a campanha inteira (versão offline) e confere as mecânicas
  celular.mjs                         Toque, celular em pé/deitado e quiz em tela baixa (versão offline)
  servidor.mjs                        Joga com o servidor de verdade: conta, partida, ranking, sessão, trapaça
```

## Como jogar

- **Na VPS:** abra o endereço do jogo, crie a conta (apelido + senha) e jogue. O progresso fica no servidor.
- **Offline:** abra `jogo/offline.html` no navegador. O progresso fica só naquele navegador e não há ranking.

**Controles:**
- **Computador:** ← → ou A/D para andar, Espaço ou W para pular, J para atacar, Esc para pausar. No quiz, Enter abre a pergunta e avança, e as teclas 1 a 4 escolhem a alternativa.
- **Celular:** botões sobrepostos (◀ ▶, PULO, ATAQUE). O jogo foi feito para a tela **na horizontal**. Na vertical, aparece um aviso para girar, com a opção de jogar assim mesmo. No Android, a missão abre em tela cheia travada na horizontal.

## Servidor (modo VPS)

O servidor é a autoridade:
- **Perguntas:** ele sorteia e corrige. O navegador nunca recebe o gabarito.
- **Eventos da partida** (inimigos, coletáveis, mestre): contam uma vez cada, só com ids que existem na fase e com teto de pontos.
- **Conclusão da missão:** só é aceita com todos os marcos respondidos, o mestre derrotado e um tempo mínimo de partida.
- **Contas:** apelido + senha (hash scrypt), sessão em cookie `HttpOnly`, proteção contra requisições de outros sites, limite de tentativas no login, consentimento (LGPD) no cadastro e exclusão da conta pelo próprio jogador em Ajustes.
- **Banco:** SQLite. Usa o módulo embutido do Node (`node:sqlite`, Node 22.13 ou mais novo) ou, em Node mais antigo, o pacote `better-sqlite3` (`cd servidor && npm install`).
- **Regras:** o servidor lê `PARAMS`, `PATENTES`, `CAMPANHA` e `FASES` do próprio `jogo/farol-template.html`, então não há duas cópias das regras.

**Rodar localmente** (serve o jogo e a API em http://127.0.0.1:3031):

```bash
FAROL_ESTATICO=1 FAROL_DB=./dados-teste/farol.db node servidor/iniciar.mjs
```

**Administração** (na VPS, dentro de `/var/www/farol`):

```bash
FAROL_DB=/var/www/farol-dados/farol.db node servidor/admin.mjs codigo APELIDO
```

O comando acima gera o código de redefinição de senha (vale 24 h). O jogador usa o código em "Esqueci a senha". Os outros comandos são `usuarios` (lista os jogadores) e `backup <arquivo.db>`.

### Publicar na VPS

Pré-requisitos: Node 22.13 ou mais novo (ou `npm install` em `servidor/`), PM2 e Caddy.

1. Atualize o código e crie a pasta de dados, fora do repositório:

```bash
git -C /var/www/farol pull --ff-only && mkdir -p /var/www/farol-dados
```

2. Suba a API com o PM2:

```bash
cd /var/www/farol && pm2 start servidor/ecosystem.config.cjs && pm2 save
```

3. No Caddy, o bloco do jogo precisa encaminhar `/api` para a API e **bloquear as versões com gabarito**:

```
http://:8085 {
	encode gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:3031
	}
	handle {
		root * /var/www/farol/jogo
		@bloqueado path *.py *.md /farol-template.html /farol-da-liberdade.html /offline.html
		respond @bloqueado 404
		file_server {
			index index.html
		}
	}
}
```

4. Atualizações futuras: `git pull` e `pm2 restart farol-api` (o restart só é necessário quando o servidor ou as regras mudarem).

> **Importante:** em `http://IP:porta` a senha trafega sem criptografia. Antes de divulgar o jogo, aponte um domínio para a VPS e troque `http://:8085` pelo domínio no Caddy. O Caddy gera o HTTPS sozinho e o cookie da sessão passa a ser `Secure`.

## Como alterar perguntas

1. Edite os JSONs em `conteudo/`. Cada pergunta tem `id`, `tema`, `nivel` (`facil`, `medio` ou `dificil`), `pergunta`, `alternativas` (4), `correta` (índice de 0 a 3), `explicacao` e `zoeira` (comentário cômico opcional).
2. Gere o jogo de novo e, na VPS, reinicie a API (ela carrega as perguntas ao iniciar):

```bash
python jogo/build_jogo.py
```

Os temas de cada missão ficam em `FASES` (no template). O Manifesto alimenta as Missões 0 a 6 e a prova final. A Cultura Faroleira alimenta a Missão 7, com o tema prefixado por `Cultura · `. Os parâmetros da prova ficam em `PARAMS.prova`.

## Regras implementadas

- **Quiz:** a resposta certa vale o valor-base (fácil 20, médio 40, difícil 60). A errada vale 25% do valor-base e mostra a explicação. Errar não trava a missão.
- **Missão:** o objetivo principal vale 200, cada objetivo opcional 50, cada inimigo 5 (até 100 por missão) e o mestre 300.
- **Ranking:** soma o melhor resultado de cada missão e é separado do XP. Desempate: mais opcionais, depois menor tempo.
- **XP e patentes:** 8 patentes (Sujeito Desconfiado → Cavaleiro do Farol), definidas por XP mínimo e missão concluída. Repetir uma missão rende 20% do XP.
- **Derrota:** dá para retomar do último ponto de controle sem ganhar a mesma recompensa duas vezes.
- **Modo sério:** desliga os comentários cômicos do quiz.

## Testes automatizados

```bash
cd servidor && node --test teste/*.test.mjs
```

```bash
node testes/servidor.mjs saida-testes "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

```bash
node testes/campanha.mjs jogo/offline.html saida-testes "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

```bash
node testes/celular.mjs jogo/offline.html saida-testes "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

Os testes de navegador abrem um Chrome sem janela (headless) e jogam sozinhos. Cada linha `OK`/`FALHA` é uma verificação, e as capturas de tela ficam em `saida-testes/`. No Linux, troque o caminho do Chrome (por exemplo, `/usr/bin/google-chrome`).

## Limitações conhecidas

- O movimento e os golpes acontecem no navegador. O servidor confere o que dá para conferir (ids válidos, cada evento uma vez, tetos, quiz, marcos, mestre e tempo mínimo), mas não simula a física do jogo.
- Recuperar a senha por e-mail exige configurar um servidor de envio (SMTP). Por enquanto, o administrador gera um código.
- Painel administrativo de perguntas: ainda não existe. As perguntas são editadas nos JSONs.
- A especificação v1.1 (§2.3) ainda lista 7 patentes. A tabela vigente, com 8, está em `docs/avaliacao-especificacao-v1.1.md` (§4.3).

## Próximos passos

1. Domínio + HTTPS para a VPS.
2. Painel administrativo de perguntas, com os campos `versao`, `status` e `revisado_por`.
3. Recuperação de senha por e-mail (SMTP).
4. Mais conteúdo para a prova final (meta: 200+ perguntas, para o sorteio repetir menos).
