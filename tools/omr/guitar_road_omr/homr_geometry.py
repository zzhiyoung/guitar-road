"""Child-process-only geometry adapter for the tested homr 0.7.0 API.

No installed files are edited. Disable homr's second autocrop so the cropped
standard staff and TAB inspector retain one known coordinate frame.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from importlib.metadata import version


def main() -> None:
    if version('homr') != '0.7.0':
        raise RuntimeError('TAB alignment requires the tested homr 0.7.0 adapter')
    import homr.main as homr_main
    from homr.model import Note

    sidecar = Path(sys.argv[1])
    original_detect = homr_main.detect_staffs_in_image
    homr_main.autocrop = lambda image: image

    def detect(image_path, config):
        result = original_detect(image_path, config)
        groups, image, _, _ = result
        staffs = [staff for group in groups for staff in group.staffs]
        sidecar.write_text(json.dumps({
            'width': int(image.shape[1]), 'height': int(image.shape[0]),
            'staffs': [{'notes': sorted(float(s.center[0]) for s in staff.symbols
                                        if isinstance(s, Note))} for staff in staffs],
        }), encoding='utf-8')
        return result

    homr_main.detect_staffs_in_image = detect
    sys.argv = ['homr', *sys.argv[2:]]
    homr_main.main()


if __name__ == '__main__':
    main()
