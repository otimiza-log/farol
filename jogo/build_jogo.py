"""Gera jogo/farol-da-liberdade.html (artefato claude.ai) e jogo/index.html (servidores comuns, ex.: VPS).

Uso:  python jogo/build_jogo.py
Edite as perguntas nos JSONs de conteudo/ e rode de novo: o jogo não precisa de mudança no código.
"""
import json, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AQUI = os.path.join(RAIZ, 'jogo')

# temas usados pelas missões jogáveis
TEMAS = {'Identidade', 'Introdução', '1º Princípio', '2º Princípio',          # Prólogo e Missão 1
         '3º Princípio', '5º Princípio', '11º Princípio', '6º e 11º Princípios',  # Missão 2
         '4º Princípio', '7º Princípio', '12º Princípio'}                      # Missão 3
CAMPOS = ('id', 'tema', 'nivel', 'pergunta', 'alternativas', 'correta', 'explicacao', 'zoeira')

def ler(nome):
    with open(os.path.join(RAIZ, 'conteudo', nome), encoding='utf-8') as f:
        return json.load(f)

manifesto = ler('quiz-faroleiros.json')
banco = [{k: q.get(k) for k in CAMPOS} | {'versao': q.get('versao', 1)}
         for q in manifesto['perguntas'] if q['tema'] in TEMAS]
mensagens = ler('quiz-mensagens.json')
msg = {k: mensagens[k] for k in ('acerto', 'erro', 'sequencia')}

with open(os.path.join(AQUI, 'farol-template.html'), encoding='utf-8') as f:
    html = f.read()

dump = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/')
assert '/*__BANCO__*/[]' in html and '/*__MSG__*/{}' in html
html = html.replace('/*__BANCO__*/[]', dump(banco)).replace('/*__MSG__*/{}', dump(msg))

# 1) versão para o artefato do claude.ai (o claude.ai acrescenta <head> e viewport ao publicar)
saida = os.path.join(AQUI, 'farol-da-liberdade.html')
with open(saida, 'w', encoding='utf-8') as f:
    f.write(html)

# 2) versão completa para qualquer servidor (VPS, GitHub Pages): documento com <head> e viewport de celular
corte = html.index('<!-- ============ TELA: INÍCIO')
cabeca, corpo = html[:corte], html[corte:]
standalone = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
              '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
              '<meta name="theme-color" content="#110e0b">\n'
              '<meta name="mobile-web-app-capable" content="yes">\n'
              '<meta name="apple-mobile-web-app-capable" content="yes">\n'
              '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
              + cabeca + '</head>\n<body>\n' + corpo + '</body>\n</html>\n')
index = os.path.join(AQUI, 'index.html')
with open(index, 'w', encoding='utf-8') as f:
    f.write(standalone)
print(f'{len(banco)} perguntas -> {saida} e {index}')
