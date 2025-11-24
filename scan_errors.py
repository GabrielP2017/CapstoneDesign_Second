from pathlib import Path
import codecs
path = Path(r'backend/be4_module.py')
data = path.read_bytes()
decoder = codecs.getincrementaldecoder('utf-8')()
errors = []
chunk = b''
idx = 0
while idx < len(data):
    try:
        decoder.decode(bytes([data[idx]]), final=False)
        idx += 1
    except UnicodeDecodeError as exc:
        errors.append(exc.start)
        idx = exc.start + 1
        decoder = codecs.getincrementaldecoder('utf-8')()
print(errors)
