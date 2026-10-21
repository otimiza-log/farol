"""Gera as duas versões do jogo a partir do template e dos bancos de perguntas.

Uso:  python jogo/build_jogo.py
Edite as perguntas nos JSONs de conteudo/ e rode de novo: o jogo não precisa de mudança no código.

- jogo/farol-da-liberdade.html: artefato do claude.ai e jogo offline. Leva o banco inteiro (com gabarito)
  e funciona sozinho, salvando no navegador (ou no banco do artefato).
- jogo/offline.html: o mesmo jogo offline como documento completo (bom para celular). Contém o gabarito.
- jogo/index.html: versão da VPS (modo servidor). Não leva banco nem gabarito: o servidor (pasta servidor/)
  sorteia as perguntas, corrige as respostas e calcula pontos, XP, patentes e ranking.

O banco tem dois módulos:
- Manifesto: missões 0 a 6 (por tema) e prova final (sorteio entre todos os princípios);
- Cultura Faroleira: Missão 7; o tema ganha o prefixo "Cultura · " para não colidir com os
  temas do Manifesto (os dois módulos têm um tema "Identidade").
"""
import json, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AQUI = os.path.join(RAIZ, 'jogo')
CAMPOS = ('id', 'tema', 'nivel', 'pergunta', 'alternativas', 'correta', 'explicacao', 'zoeira')

def ler(nome):
    with open(os.path.join(RAIZ, 'conteudo', nome), encoding='utf-8') as f:
        return json.load(f)

def pergunta(q, modulo, prefixo=''):
    item = {k: q.get(k) for k in CAMPOS}
    item['tema'] = prefixo + q['tema']
    item['modulo'] = modulo
    item['versao'] = q.get('versao', 1)
    return item

manifesto = ler('quiz-faroleiros.json')
cultura = ler('quiz-cultura-faroleira.json')
banco = ([pergunta(q, 'manifesto') for q in manifesto['perguntas']]
         + [pergunta(q, 'cultura', 'Cultura · ') for q in cultura['perguntas']])
mensagens = ler('quiz-mensagens.json')
msg = {k: mensagens[k] for k in ('acerto', 'erro', 'sequencia')}

with open(os.path.join(AQUI, 'farol-template.html'), encoding='utf-8') as f:
    template = f.read()

def dump(o):
    return json.dumps(o, ensure_ascii=False).replace('</', '<\\/')

for marca in ('/*__BANCO__*/[]', '/*__MSG__*/{}', '/*__SERVIDOR__*/false'):
    assert marca in template, f'marca {marca} não encontrada no template'

# 1) artefato do claude.ai / offline (o claude.ai acrescenta <head> e viewport ao publicar)
html = template.replace('/*__BANCO__*/[]', dump(banco)).replace('/*__MSG__*/{}', dump(msg))
saida = os.path.join(AQUI, 'farol-da-liberdade.html')
with open(saida, 'w', encoding='utf-8') as f:
    f.write(html)

def documento(corpo_html):
    """documento completo com <head> e viewport de celular (no artefato, o claude.ai faz isso sozinho)"""
    corte = corpo_html.index('<!-- ============ TELA: INÍCIO')
    cabeca, corpo = corpo_html[:corte], corpo_html[corte:]
    return ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="theme-color" content="#110e0b">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
            + cabeca + '</head>\n<body>\n' + corpo + '</body>\n</html>\n')

# 2) VPS (modo servidor): sem banco e sem gabarito
html_servidor = (template.replace('/*__BANCO__*/[]', '[]')
                 .replace('/*__MSG__*/{}', dump(msg))
                 .replace('/*__SERVIDOR__*/false', 'true'))
index = os.path.join(AQUI, 'index.html')
with open(index, 'w', encoding='utf-8') as f:
    f.write(documento(html_servidor))

# 3) offline com viewport de celular (abrir direto no navegador). NÃO publicar na VPS: contém o gabarito.
offline = os.path.join(AQUI, 'offline.html')
with open(offline, 'w', encoding='utf-8') as f:
    f.write(documento(html))

print(f'{len(banco)} perguntas ({len(manifesto["perguntas"])} manifesto + {len(cultura["perguntas"])} cultura)')
print(f'  artefato: {saida}')
print(f'  offline (celular): {offline}')
print(f'  VPS (modo servidor, sem gabarito): {index}')
