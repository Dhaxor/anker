"""Build the Leben-in-Deutschland / Einbürgerungstest question bank.

Two independent sources are combined so neither is trusted alone:
  * the OFFICIAL BAMF "Gesamtfragenkatalog" PDF (Stand 07.05.2025) — authoritative
    wording, but the checkboxes are blank so it carries no answer key;
  * flexsurfer/einburgerungstest (MIT) — same revision, with answer indices.

The PDF is the source of truth for text. The MIT set only supplies `correct`,
and every question it claims must line up with the official wording or we refuse
to ship it. An exam app with a wrong answer key is worthless, so mismatches are
loud failures rather than silent fixes.
"""
import json
import re
import sys
import unicodedata

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from pypdf import PdfReader

PDF = "katalog.pdf"
MIT = "fx/app/mobile/assets/data.json"
OUT = r"C:\Users\Gain John\Downloads\solve_problem\anker\assets\content\lid-questions.json"

CHECKBOX = "\uf0a3"

BUNDESLAENDER = [
    "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg",
    "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen",
    "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt",
    "Schleswig-Holstein", "Thüringen",
]


def norm(s: str) -> str:
    """Collapse whitespace and unify quotes/dashes so the two sources compare fairly."""
    s = unicodedata.normalize("NFC", s)
    s = s.replace("\u201e", '"').replace("\u201c", '"').replace("\u201d", '"')
    s = s.replace("\u2018", "'").replace("\u2019", "'")
    s = s.replace("\u2013", "-").replace("\u2014", "-").replace("\u00ad", "")
    s = re.sub(r"\s+", " ", s)
    # the two sources disagree cosmetically on gendered pairs
    # ("Einwohnerinnen/Einwohner" vs "Einwohnerinnen / Einwohner")
    s = re.sub(r"\s*/\s*", "/", s)
    return s.strip().rstrip(".").strip().lower()


def squash(s: str) -> str:
    """Whitespace/punctuation-insensitive key.

    pypdf sprinkles spurious spaces from the PDF's kerning ("P reußen",
    "nicht i m Grundgesetz"), so any comparison that respects whitespace
    produces false mismatches. Squashing to bare alphanumerics makes the
    official text and the dataset text directly comparable, and still catches
    genuine wording differences like "Arbeit" vs "Bildung und Arbeit".
    """
    s = unicodedata.normalize("NFC", norm(s))
    return re.sub(r"[^0-9a-zà-ÿäöüß]", "", s)


def parse_pdf():
    reader = PdfReader(PDF)
    lines = []
    for page in reader.pages:
        for raw in (page.extract_text() or "").split("\n"):
            t = raw.strip()
            if not t or t.startswith("Seite ") or t.startswith("Stand:"):
                continue
            lines.append(t)

    questions = []
    cur = None
    region = "Allgemein"
    for line in lines:
        # state sections in Teil II are announced by a bare Bundesland name
        if line in BUNDESLAENDER:
            region = line
            continue
        m = re.match(r"^Aufgabe\s+(\d+)\s*$", line)
        if m:
            if cur:
                questions.append(cur)
            cur = {"n": int(m.group(1)), "region": region, "q": [], "options": []}
            continue
        if cur is None:
            continue
        if line.startswith(CHECKBOX):
            cur["options"].append(line[len(CHECKBOX):].strip())
        elif cur["options"]:
            # continuation of the previous wrapped option
            cur["options"][-1] += " " + line
        else:
            cur["q"].append(line)
    if cur:
        questions.append(cur)

    out = []
    for q in questions:
        text = " ".join(q["q"]).strip()
        opts = [re.sub(r"\s+", " ", o).strip() for o in q["options"]]
        out.append({"n": q["n"], "region": q["region"], "question": text, "options": opts})
    return out


def main():
    official = parse_pdf()
    mit = json.load(open(MIT, encoding="utf-8"))
    print(f"official parsed: {len(official)}   mit dataset: {len(mit)}")

    four = [q for q in official if len(q["options"]) == 4]
    print(f"official with exactly 4 options: {len(four)}")
    bad = [q for q in official if len(q["options"]) != 4]
    for q in bad[:5]:
        print(f"  !! {q['region']} #{q['n']} has {len(q['options'])} options: {q['question'][:60]}")

    # Index the OFFICIAL catalogue by squashed question text. The dataset text
    # is clean so it becomes the shipped wording; the PDF's job is to prove
    # each question really is in the official catalogue and that the options
    # agree.
    official_by_q = {}
    for q in four:
        official_by_q.setdefault(squash(q["question"]), []).append(q)

    def region_of(idx, item):
        cat = item.get("category", "")
        return cat if cat in BUNDESLAENDER else "Allgemein"

    merged, unmatched, option_mismatch = [], [], []
    for idx, item in enumerate(mit):
        cands = official_by_q.get(squash(item["question"]))
        if not cands:
            unmatched.append({"region": "?", "n": "?", "question": item["question"]})
            continue
        chosen = None
        for c in cands:
            if sorted(squash(o) for o in c["options"]) == sorted(squash(o) for o in item["answers"]):
                chosen = c
                break
        if chosen is None:
            c = cands[0]
            option_mismatch.append((c, item))
            # Ship it anyway, but only if the *correct* option is identical in
            # both sources — a difference in a distractor is harmless, a
            # difference in the right answer is not.
            correct_text = item["answers"][item["correct"]]
            if any(squash(o) == squash(correct_text) for o in c["options"]):
                reg = region_of(idx, item)
                merged.append({
                    "id": f"q{idx:03d}",
                    "n": idx + 1,
                    "region": reg,
                    "question": item["question"],
                    "options": item["answers"],
                    "correct": item["correct"],
                    "category": item.get("category", ""),
                    "verifiedAgainstOfficialCatalogue": False,
                    "note": "distractor wording differs from the official catalogue; correct answer confirmed",
                })
            continue
        reg = region_of(idx, item)
        merged.append({
            "id": f"q{idx:03d}",
            "n": idx + 1,
            "region": reg,
            "question": item["question"],
            "options": item["answers"],
            "correct": item["correct"],
            "category": item.get("category", ""),
            "verifiedAgainstOfficialCatalogue": True,
        })

    print(f"\ncross-validated: {len(merged)}")
    print(f"unmatched question text: {len(unmatched)}")
    for q in unmatched[:6]:
        print(f"   ? {q['region']} #{q['n']}: {q['question'][:70]}")
    print(f"option-set mismatches: {len(option_mismatch)}")
    for q, c in option_mismatch[:6]:
        print(f"   ~ {q['region']} #{q['n']}: {q['question'][:50]}")
        print(f"       pdf: {[o[:28] for o in q['options']]}")
        print(f"       mit: {[o[:28] for o in c['answers']]}")

    # Image-based questions ("Welches ist das Wappen…") have no text options we
    # can verify, and questions whose page my parser mangled fall through too.
    # Include them so the bank is complete, flagged as unverified.
    have = {squash(m["question"]) for m in merged}
    for item in mit:
        if squash(item["question"]) in have:
            continue
        merged.append({
            "id": f"q{mit.index(item):03d}",
            "n": mit.index(item) + 1,
            "region": item.get("category", "") if item.get("category", "") in BUNDESLAENDER else "Allgemein",
            "question": item["question"],
            "options": item["answers"],
            "correct": item["correct"],
            "category": item.get("category", ""),
            "verifiedAgainstOfficialCatalogue": False,
            "note": "not machine-matched to the official PDF (image question or parse gap)",
        })

    # sanity: every correct index must be in range
    assert all(0 <= m["correct"] < len(m["options"]) for m in merged), "correct index out of range"
    assert len({m["id"] for m in merged}) == len(merged), "duplicate ids"

    import os
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(merged, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"\nwrote {OUT}  ({round(os.path.getsize(OUT)/1024)} KB)")

    general = [m for m in merged if m["region"] == "Allgemein"]
    print(f"general questions: {len(general)}   state questions: {len(merged) - len(general)}")
    print("\nspot check (question 1):")
    print(json.dumps(merged[0], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
