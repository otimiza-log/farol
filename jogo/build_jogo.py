"""Gera jogo/farol-da-liberdade.html a partir do template e dos bancos de perguntas.

Uso:  python jogo/build_jogo.py
Edite as perguntas nos JSONs de conteudo/ e rode de novo: o jogo não precisa de mudança no código.
"""
import json, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AQUI = os.path.join(RAIZ, 'jogo')

# temas usados nesta fatia vertical (Prólogo + Missão 1)
TEMAS = {'Identidade', 'Introdução', '1º Princípio', '2º Princípio'}
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

saida = os.path.join(AQUI, 'farol-da-liberdade.html')
with open(saida, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'{len(banco)} perguntas -> {saida}')
