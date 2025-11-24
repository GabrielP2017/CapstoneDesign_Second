# -*- coding: utf-8 -*-
from pathlib import Path
text = Path('be4_module.py').read_text(encoding='utf-8')
print('Á¤»ó' in text)
start = text.index('        if not taxable:')
print(text[start:start+200])
