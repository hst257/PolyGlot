"""Build a static Pages app containing the real Python compiler, without a server."""
import argparse
import shutil
import urllib.request
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_VERSION = "314.0.7"
RUNTIME_FILES = ("pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json")


def runtime(destination: Path, source: Path | None = None) -> None:
    target = destination / "runtime"
    target.mkdir(exist_ok=True)
    for name in RUNTIME_FILES:
        if source:
            shutil.copyfile(source / name, target / name)
        else:
            url = f"https://cdn.jsdelivr.net/pyodide/v{RUNTIME_VERSION}/full/{name}"
            with urllib.request.urlopen(url, timeout=180) as response:
                with (target / name).open("wb") as output:
                    shutil.copyfileobj(response, output)
    notice = (ROOT / "tools/pages/PYODIDE-NOTICE.txt").read_bytes()
    (target / "PYODIDE-NOTICE.txt").write_bytes(notice)
    (target / "PYODIDE-LICENSE.txt").write_bytes((ROOT / "tools/pages/PYODIDE-LICENSE.txt").read_bytes())



def build(destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    static = ROOT / "src/polyglot/web/static"
    for name in ("style.css", "app.js", "examples.json"):
        (destination / name).write_bytes((static / name).read_bytes())
    html = (static / "index.html").read_text(encoding="utf-8")
    html = html.replace('href="/style.css"', 'href="./style.css"')
    html = html.replace('class="brand" href="/"', 'class="brand" href="./"')
    html = html.replace('<script src="/app.js"></script>',
                        '<script src="./browser-runtime.js"></script>\n<script src="./app.js"></script>')
    html = html.replace("Local execution", "Browser execution")
    html = html.replace("Offline · Shared semantics · Custom VM", "In-browser compiler · Shared semantics · Custom VM")
    html = html.replace("An offline workspace for writing and running mixed-syntax Polyglot programs.",
                        "Write and run mixed-syntax Polyglot programs directly in your browser.")
    (destination / "index.html").write_text(html, encoding="utf-8")
    files = {}
    for source in sorted((ROOT / "src/polyglot").rglob("*.py")):
        relative = source.relative_to(ROOT / "src")
        if relative.as_posix() in ("polyglot/cli.py", "polyglot/__main__.py", "polyglot/web/server.py"):
            continue
        files[relative.as_posix()] = source.read_text(encoding="utf-8")
    (destination / "compiler-package.json").write_text(json.dumps(files, ensure_ascii=False), encoding="utf-8")
    for name in ("browser-runtime.js", "compiler-worker.mjs"):
        (destination / name).write_bytes((ROOT / "tools/pages" / name).read_bytes())
    (destination / "LICENSE").write_bytes((ROOT / "LICENSE").read_bytes())
    (destination / "THIRD_PARTY_NOTICES").write_bytes((ROOT / "THIRD_PARTY_NOTICES").read_bytes())
    (destination / ".nojekyll").touch()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "build/pages")
    parser.add_argument("--download-runtime", action="store_true")
    parser.add_argument("--runtime-dir", type=Path)
    args = parser.parse_args()
    build(args.output)
    if args.download_runtime or args.runtime_dir:
        runtime(args.output, args.runtime_dir)
