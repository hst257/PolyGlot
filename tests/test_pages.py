"""Static builds carry exactly the same compiler and survive project subpaths."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_pages", ROOT / "tools/build_pages.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_static_build_uses_relative_assets_and_browser_adapter(tmp_path):
    module.build(tmp_path)
    html = (tmp_path / "index.html").read_text()
    assert 'href="./style.css"' in html
    assert 'class="brand" href="./"' in html
    assert html.index('./browser-runtime.js') < html.index('./app.js')
    assert 'src="/' not in html
    assert 'href="/style.css"' not in html
    assert "Browser execution" in html
    assert (tmp_path / ".nojekyll").exists()
    assert json.loads((tmp_path / "examples.json").read_text())


def test_static_build_packages_original_compiler_without_server(tmp_path):
    module.build(tmp_path)
    files = json.loads((tmp_path / "compiler-package.json").read_text())
    for name in ("compiler.py", "optimizer.py", "analysis.py", "vm.py", "web/worker.py", "parser/dispatch.py"):
        assert files['polyglot/' + name] == (ROOT / 'src/polyglot' / name).read_text()
    assert 'polyglot/web/server.py' not in files
    assert 'polyglot/cli.py' not in files
    assert all(name.endswith('.py') and '..' not in name for name in files)
