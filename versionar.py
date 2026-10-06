#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carimba uma versão nas URLs do site (anti-cache do GitHub Pages).

    python3 versionar.py        # usa a data/hora de agora

O GitHub Pages serve tudo com `Cache-Control: max-age=600`, e cada arquivo expira
num horário diferente — dá para o navegador pegar o index.html novo com o app.js
velho (a página abre quebrada pela metade). Marcando ?v=<versão> nas referências,
o HTML novo aponta para URLs novas de script, estilo e dados: o navegador é
obrigado a baixar tudo junto. Rodar antes de cada commit do site.
"""
import datetime
import os
import re
import sys

PASTA = os.path.dirname(os.path.abspath(__file__))

# Cada regra marca a URL do grupo 1 (o ?v= antigo, se houver, está no grupo 2 e é descartado).
REGRAS = {
    "index.html": [
        re.compile(r'((?:href|src)="(?:style\.css|app\.js))(\?v=[^"]*)?(")'),
    ],
    "app.js": [
        re.compile(r'(from "\./(?:telas|xr)\.js)(\?v=[^"]*)?(")'),
        re.compile(r'("data/(?:modelo|projeto)\.(?:json|bin))(\?v=[^"]*)?(")'),
    ],
}


def versao():
    return datetime.datetime.now().strftime("%Y%m%d%H%M")


def carimbar(v):
    mudou = []
    for arq, regras in REGRAS.items():
        caminho = os.path.join(PASTA, arq)
        with open(caminho, encoding="utf-8") as f:
            orig = f.read()
        s = orig
        for r in regras:
            s = r.sub(lambda m: "%s?v=%s%s" % (m.group(1), v, m.group(3)), s)
        if s != orig:
            with open(caminho, "w", encoding="utf-8") as f:
                f.write(s)
            mudou.append(arq)
    return mudou


if __name__ == "__main__":
    v = sys.argv[1] if len(sys.argv) > 1 else versao()
    print("versão %s → %s" % (v, ", ".join(carimbar(v)) or "nada mudou"))
