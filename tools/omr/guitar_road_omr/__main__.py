"""支持 `python -m guitar_road_omr ...`（Node 层使用的调用形式）。"""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
