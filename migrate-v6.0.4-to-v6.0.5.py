#!/usr/bin/env python3
import sys
from pathlib import Path
TOOLING = Path(__file__).resolve().parent / "tooling"
sys.path.insert(0, str(TOOLING))
from ade_tooling.cli import main
raise SystemExit(main(["migrate", *sys.argv[1:]]))
