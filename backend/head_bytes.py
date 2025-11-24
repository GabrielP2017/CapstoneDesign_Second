from pathlib import Path
path = Path('be4_module.py')
data = path.read_bytes()
print(list(data[:8]))
