"""Regenerates the import map in index.html with a fresh version stamp.

Telegram and GitHub Pages cache every file separately for a while, so after a
deploy a phone could combine new and old modules and fail to start. Every
module and the stylesheet are loaded through versioned URLs instead; run this
before each release:

    python3 scripts/bump_version.py
"""

import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

version = time.strftime("%Y%m%d%H%M%S")
modules = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "js").rglob("*.js"))
import_map = {"imports": {f"./{m}": f"./{m}?v={version}" for m in modules}}

html = INDEX.read_text()
html = re.sub(
    r'(<script type="importmap">).*?(</script>)',
    lambda m: m.group(1) + "\n" + json.dumps(import_map, indent=2) + "\n  " + m.group(2),
    html,
    flags=re.S,
)
html = re.sub(r'styles\.css(\?v=\d+)?', f"styles.css?v={version}", html)
INDEX.write_text(html)
print(f"index.html: {len(modules)} modules, version {version}")
