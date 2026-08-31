from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tooling'))
from ade_tooling.cli import main
raise SystemExit(main(['migrate',*sys.argv[1:]]))
