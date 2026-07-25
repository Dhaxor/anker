# Shipping Anker

Everything that can be automated already is. This file covers the two steps that
need your Apple/GitHub credentials, and exactly what I run afterwards.

---

## Status

| | |
|---|---|
| App | Anker — Einbürgerungstest & Leben in Deutschland |
| Bundle ID | `app.anker.einbuergerung` |
| EAS project | `@dhaxor/anker-einbuergerungstest` (`dad0750c-7e7d-41ef-897f-5f5e572d9ca9`) |
| Version | 1.0.0 (build 1) |
| Native build | ✅ green — `b2d80904-6737-4ead-b050-6e41b3370589`, iOS simulator, SDK 57 |
| Tests | 100 passing, `tsc --noEmit` clean |
| Store listing | written + validated (`store/localizations/de-DE.strings`) |
| Icon / splash | generated (`python scripts/make_icon.py`) |
| Purchases | built, **disabled** until the product exists (`PURCHASES_ENABLED` in `contexts/EntitlementContext.tsx`) |

---

## Step 1 — create the App Store record (you)

Apple's public API cannot create apps; it needs an Apple ID web session with your
password and 2FA, which I do not handle. Two minutes in App Store Connect:

1. **My Apps → + → New App**
2. Platform **iOS**
3. Name **`Anker: Einbürgerungstest`**
4. Primary language **German (Germany)**
5. Bundle ID **`app.anker.einbuergerung`** — if it is not in the dropdown, register it
   first at [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
6. SKU: anything unique, e.g. `ANKER-EBT-001`

Then send me the **Apple ID number** shown on the app's page (a 10-digit number).

## Step 2 — push the repo to GitHub (you)

The free iOS screenshot harness runs on GitHub Actions macOS runners, so the repo
needs a remote. Any private repo works:

```bash
git -C "Downloads/solve_problem/anker" remote add origin https://github.com/<you>/anker.git
git -C "Downloads/solve_problem/anker" push -u origin HEAD
```

---

## Step 3 — everything after that is mine

Given the app ID and a remote, I run:

1. Drop the app ID into `eas.json` → `submit.production.ios.ascAppId`
2. Create the one-time IAP `app.anker.einbuergerung.pro` via the `asc` CLI, localise
   it, and set prices in **every** territory — Apple leaves a product in
   `MISSING_METADATA` if any territory lacks a price row, which cost a day on
   Scripture Mate
3. Flip `PURCHASES_ENABLED = true` and wire `expo-iap` (same shape as Scripture
   Mate's `EntitlementContext`)
4. Push metadata: `asc app-setup localizations upload`
5. Production build + submit: `eas build --profile production --auto-submit`
6. Port the Appium walkthrough and capture real 6.7" device screenshots
7. Attach the IAP to the review submission, validate, submit for review

**Your remaining manual step after that:** a sandbox purchase test on a real
device. Apple requires it and I cannot sign into a sandbox account.

---

## Local commands

```bash
bun test                  # 100 tests
bunx tsc --noEmit         # typecheck
npm ci --include=dev      # ALWAYS verify this before an EAS build (see below)
python scripts/make_icon.py        # regenerate icon/splash/adaptive/favicon
python scripts/check_metadata.py   # validate store listing field limits
python scripts/build_lid_questions.py  # rebuild the question bank
```

Run the app on web for fast verification: preview server `anker-web` (port 8091,
configured in the workspace `.claude/launch.json`).

---

## Traps already hit, so they are not hit again

- **`npm ci` lockfile drift killed the first build.** EAS runs
  `npm ci --include=dev`, which refuses to install when `package-lock.json` and
  `package.json` disagree — while local `npm install` tolerates it silently. A
  `--legacy-peer-deps` install had pinned three `@react-native/*` packages a patch
  ahead. Never use `--legacy-peer-deps` here; always verify with `npm ci` first.
- **EAS build logs are brotli-compressed**, not gzip. `gzip.decompress` fails and
  raw-deflate "succeeds" while emitting garbage, which sends you after the wrong
  cause. Decoder: scratchpad `read_eas_log.py`.
- **Guideline 4.3(a)** forbids one-app-per-country. France/Italy/UK versions must
  be genuinely distinct products, not reskins of this bundle ID.
- **Guideline 2.3.8** reserves "for Kids" wording for the Kids Category.
- Keep **"Einbürgerungstest"** contiguous in the app name and **"Leben in
  Deutschland"** contiguous in the subtitle. Splitting a key phrase across fields
  is penalised by the search algorithm.
- The listing states plainly that Anker is **not a BAMF app** and that the
  questions come from the published catalogue. Keep that — it is both true and
  the thing that avoids an affiliation rejection.

---

## Content provenance

460 questions: 300 general + 160 across the 16 Bundesländer, parsed from the
official BAMF *Gesamtfragenkatalog* (Stand 07.05.2025) and cross-validated against
an MIT-licensed answer key.

- **398** match the official catalogue word for word
- **16** have a differing distractor but a confirmed correct answer
- **46** are image questions or parse gaps, flagged
  `verifiedAgainstOfficialCatalogue: false` and labelled as such in the app

The cross-check caught real drift: official question 7 lists "Arbeit" where the
community dataset says "Bildung und Arbeit". Never trust a single source for an
exam bank.
