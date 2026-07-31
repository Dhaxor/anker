"""Split store/localizations/de-DE.strings into version-level keys only.

The asc uploader rejects a file that mixes app-info keys (name, subtitle)
with version keys, so the version upload needs a filtered copy.

Usage: python scripts/split_strings.py OUTDIR
"""

import os
import re
import sys

VERSION_KEYS = {
    "description",
    "keywords",
    "whatsNew",
    "promotionalText",
    "supportUrl",
    "marketingUrl",
}

PAIR = re.compile(r'^"([A-Za-z]+)"\s*=\s*"(?:[^"\\]|\\.)*"\s*;', re.M)


def main() -> int:
    outdir = sys.argv[1]
    text = open("store/localizations/de-DE.strings", encoding="utf-8").read()
    kept = [m.group(0) for m in PAIR.finditer(text) if m.group(1) in VERSION_KEYS]
    os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, "de-DE.strings")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(kept) + "\n")
    print(f"wrote {out} with {len(kept)} version-level entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
