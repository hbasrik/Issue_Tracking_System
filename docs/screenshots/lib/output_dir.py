"""Where verification scripts write their files (same rule as output-dir.mjs).

Committed evidence under docs/screenshots/ is only overwritten with
UPDATE_SCREENSHOTS=1; otherwise the same relative layout goes under
$TMPDIR/karea-shots/. Paths outside docs/screenshots/ are used as given.
"""
import os
import sys
import tempfile

UPDATE = os.environ.get("UPDATE_SCREENSHOTS") == "1"
TEMP_ROOT = os.path.join(tempfile.gettempdir(), "karea-shots")
_MARK = f"{os.sep}docs{os.sep}screenshots{os.sep}"
_announced = set()


def output_dir(path):
    abs_path = os.path.abspath(path) + os.sep
    i = abs_path.rfind(_MARK)
    if UPDATE or i < 0:
        out = abs_path.rstrip(os.sep)
    else:
        out = os.path.join(TEMP_ROOT, abs_path[i + len(_MARK):]).rstrip(os.sep)
    os.makedirs(out, exist_ok=True)
    if out not in _announced:
        _announced.add(out)
        note = " (UPDATE_SCREENSHOTS=1, committed files)" if UPDATE else ""
        print(f"output: {out}{note}", file=sys.stderr)
    return out


def script_output_dir(script_file, *sub):
    return output_dir(os.path.join(os.path.dirname(os.path.abspath(script_file)), *sub))
