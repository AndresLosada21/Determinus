from __future__ import annotations
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tooling'))
from ade_tooling.cli import main
raise SystemExit(main(['live-test', *sys.argv[1:]]))
