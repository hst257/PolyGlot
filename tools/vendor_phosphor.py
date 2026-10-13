"""Vendor official SVGs and refresh the inline HTML sprite.

Fetch: npm pack @phosphor-icons/core@2.1.1 --pack-destination build/ui-assets
Run: python tools/vendor_phosphor.py build/ui-assets/phosphor-icons-core-2.1.1.tgz
"""
import json
from pathlib import Path
import re
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
ICONS = ("code", "folder-open", "download-simple", "file-code", "play", "check-circle",
         "package", "terminal-window", "tree-structure", "magnifying-glass", "sun", "moon",
         "keyboard", "shield-check", "caret-right", "brackets-curly", "arrows-out", "arrows-in")


def vendor(archive: Path):
    destination = ROOT / "third_party/phosphor"
    destination.mkdir(parents=True, exist_ok=True)
    symbols = []
    with tarfile.open(archive, "r:gz") as package:
        def read(name):
            return package.extractfile("package/" + name).read().decode("utf-8")

        metadata = json.loads(read("package.json"))
        if metadata["name"] != "@phosphor-icons/core" or metadata["version"] != "2.1.1":
            raise ValueError("Expected @phosphor-icons/core version 2.1.1.")
        (destination / "LICENSE").write_bytes(read("LICENSE").encode("utf-8"))
        for name in ICONS:
            svg = read(f"assets/regular/{name}.svg")
            (destination / f"{name}.svg").write_bytes(svg.encode("utf-8"))
            body = re.search(r"<svg\b[^>]*>(.*)</svg>", svg, re.DOTALL).group(1)
            symbols.append(f'<symbol id="ph-{name}" viewBox="0 0 256 256">{body}</symbol>')
    target = ROOT / "src/polyglot/web/static/index.html"
    html = target.read_text(encoding="utf-8")
    sprite = '<!-- Phosphor sprite start -->\n<svg class="icon-sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>\n' + "\n".join(symbols) + '\n</defs></svg>\n<!-- Phosphor sprite end -->'
    html, count = re.subn(r"<!-- Phosphor sprite start -->.*?<!-- Phosphor sprite end -->", lambda _: sprite, html, flags=re.DOTALL)
    if count != 1:
        raise ValueError("Expected one Phosphor sprite region in index.html.")
    target.write_text(html, encoding="utf-8")
    print(f"Vendored {len(ICONS)} regular-weight icons from {metadata['name']} {metadata['version']}.")


if __name__ == "__main__":
    vendor(Path(sys.argv[1]))
