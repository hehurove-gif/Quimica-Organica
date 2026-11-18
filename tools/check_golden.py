#!/usr/bin/env python3
"""Comprobación INDEPENDIENTE de la tabla de oro (test/oro.json).

Calcula la fórmula molecular a partir del SMILES con un lector propio (sin compartir
código con el núcleo JS) y la compara con la fórmula declarada a mano. Un error aquí
significa que la tabla está mal, no el núcleo. Uso: python3 tools/check_golden.py
"""
import json, re, sys
from collections import Counter

VAL = {'C': 4, 'N': 3, 'O': 2, 'F': 1, 'Cl': 1, 'Br': 1, 'I': 1}
SUB = str.maketrans('0123456789', '₀₁₂₃₄₅₆₇₈₉')

def formula(smiles):
    toks = re.findall(r'Cl|Br|[CNOFI]|[=#]|[()]', smiles)
    atoms, bsum, stack, prev, order = [], [], [], None, 1
    for t in toks:
        if t in '=#' and t:
            order = 2 if t == '=' else 3
        elif t == '(':
            stack.append(prev)
        elif t == ')':
            prev = stack.pop()
        else:
            atoms.append(t); bsum.append(0)
            i = len(atoms) - 1
            if prev is not None:
                bsum[prev] += order; bsum[i] += order
            prev, order = i, 1
    cnt = Counter(atoms)
    cnt['H'] = 0
    for a, b in zip(atoms, bsum):
        h = VAL[a] - b
        if h < 0:
            raise ValueError(f'valencia excedida en {a}: {smiles}')
        cnt['H'] += h
    parts = []
    if cnt['C']:
        parts += [('C', cnt.pop('C'))]
        h = cnt.pop('H')
        if h: parts += [('H', h)]
        parts += sorted(cnt.items())
    else:
        cnt = Counter({k: v for k, v in cnt.items() if v})
        parts = sorted(cnt.items())
    return ''.join(e + (str(n).translate(SUB) if n > 1 else '') for e, n in parts)

def main():
    data = json.load(open('test/oro.json', encoding='utf-8'))
    bad = 0
    for d in data:
        got = formula(d['smiles'])
        if got != d['formula']:
            bad += 1
            print(f"✗ {d['nombre']}: declarada {d['formula']} / SMILES da {got}")
    names = sum(1 + len(d['variantes']) for d in data)
    print(f"{len(data)} compuestos, {names} nombres, {bad} discrepancias")
    sys.exit(1 if bad else 0)

main()
