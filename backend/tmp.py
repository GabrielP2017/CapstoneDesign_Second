from pathlib import Path
text = Path('backend/be4_module.py').read_text(encoding='utf-8')
needle = "        if not taxable:\r\n\r\n            risk_level = \"LOW\" if risk_level == \"LOW\" else risk_level\r\n\r\n            risk_label = \"?""  # placeholder
