"""Validate App Store metadata against Apple's field limits before submission.

Apple rejects on these silently late in the process, and ASO rules add two more
that are easy to breach by accident: keywords must not repeat words already in
the name or subtitle (those are indexed anyway, so a repeat wastes characters),
and a multi-word key phrase must stay contiguous within one field.
"""
import re
import sys

PATH = "store/localizations/de-DE.strings"
LIMITS = {"name": 30, "subtitle": 30, "keywords": 100, "promotionalText": 170, "description": 4000}

VALUE_RE = re.compile(r'"(\w+)"\s*=\s*"((?:[^"\\]|\\.)*)"', re.S)


def main() -> int:
    text = open(PATH, encoding="utf-8").read()
    values = dict(VALUE_RE.findall(text))
    ok = True

    for field, limit in LIMITS.items():
        n = len(values.get(field, ""))
        if n == 0:
            print(f"MISSING {field}")
            ok = False
            continue
        status = "ok  " if n <= limit else "OVER"
        if n > limit:
            ok = False
        print(f"{status} {field}: {n}/{limit}")

    indexed = set(re.findall(r"\w+", (values["name"] + " " + values["subtitle"]).lower()))
    keywords = [k.strip().lower() for k in values["keywords"].split(",") if k.strip()]
    dupes = sorted({k for k in keywords if k in indexed})
    if dupes:
        print(f"WASTE keywords already indexed via name/subtitle: {dupes}")
        ok = False
    else:
        print(f"ok   keywords: {len(keywords)} terms, none duplicated from name/subtitle")

    if " " in values["keywords"]:
        print("WARN keywords contain spaces — Apple counts them; use commas only")
        ok = False

    # the two head terms must each survive intact inside a single field
    for phrase, field in (("einbürgerungstest", "name"), ("leben in deutschland", "subtitle")):
        if phrase not in values[field].lower():
            print(f"SPLIT '{phrase}' is not contiguous in {field}")
            ok = False
        else:
            print(f"ok   '{phrase}' contiguous in {field}")

    print()
    print("name:    ", values["name"])
    print("subtitle:", values["subtitle"])
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
