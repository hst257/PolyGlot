"""Offline source-tree launcher; installation is optional."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

if __name__ == "__main__":
    from polyglot.cli import main
    raise SystemExit(main())
