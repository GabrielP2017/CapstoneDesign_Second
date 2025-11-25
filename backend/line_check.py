from pathlib import Path
text = Path('be4_module.py').read_text(encoding='utf-8', errors='replace')
print(text.splitlines()[34])
