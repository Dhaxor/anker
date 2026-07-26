"""Push the German App Store listing to App Store Connect.

Apple splits listing fields across two records and the CLI mirrors that:
  * appInfoLocalization      -> name, subtitle, privacyPolicyUrl
  * appStoreVersionLocalization -> description, keywords, promotionalText,
                                   whatsNew, supportUrl, marketingUrl

This script owns the second half. Run scripts/check_metadata.py first; it
validates the field limits that Apple rejects on.
"""

import json
import re
import subprocess
import sys

APP_ID = "6794756607"
LOCALE = "de-DE"
SITE = "https://dhaxor.github.io/anker/"
SOURCE = "store/localizations/de-DE.strings"

# Apple's hard limits. Exceeding any of these is a rejection, not a warning.
LIMITS = {
    "name": 30,
    "subtitle": 30,
    "keywords": 100,
    "description": 4000,
    "promotionalText": 170,
    "whatsNew": 4000,
}

PAIR = re.compile(r'^"([A-Za-z]+)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;', re.M)


def load() -> dict[str, str]:
    text = open(SOURCE, encoding="utf-8").read()
    out: dict[str, str] = {}
    for m in PAIR.finditer(text):
        key, raw = m.group(1), m.group(2)
        out[key] = raw.replace("\\n", "\n").replace('\\"', '"')
    return out


def main() -> int:
    vals = load()
    if not vals:
        print("no keys parsed from", SOURCE)
        return 1

    problems = []
    for key, limit in LIMITS.items():
        if key in vals and len(vals[key]) > limit:
            problems.append(f"{key}: {len(vals[key])} > {limit}")
    for key in ("description", "keywords", "whatsNew"):
        if key not in vals:
            problems.append(f"{key}: missing (required for submission)")
    if problems:
        print("REFUSING TO PUSH:")
        for p in problems:
            print("  -", p)
        return 1

    for key in LIMITS:
        if key in vals:
            print(f"  {key}: {len(vals[key])}/{LIMITS[key]}")

    cmd = [
        "asc", "apps", "info", "edit",
        "--app", APP_ID,
        "--locale", LOCALE,
        "--description", vals["description"],
        "--keywords", vals["keywords"],
        "--promotional-text", vals.get("promotionalText", ""),
        "--whats-new", vals["whatsNew"],
        "--support-url", SITE,
        "--marketing-url", SITE,
        "--output", "json",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, shell=True)
    if r.returncode != 0:
        print("push failed:", (r.stderr or r.stdout)[:800])
        return r.returncode
    print("pushed OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
