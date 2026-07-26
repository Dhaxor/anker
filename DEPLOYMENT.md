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
| Tests | 121 passing, `tsc --noEmit` clean |
| Store listing | ✅ **pushed live** — name, subtitle, description, keywords, whatsNew, URLs |
| Screenshots | ✅ **6 uploaded** at APP_IPHONE_67, all COMPLETE |
| Categories | ✅ EDUCATION / REFERENCE, app free |
| Age rating | ✅ all NONE/false (no Kids Category) |
| Privacy + Support URL | ✅ live at dhaxor.github.io/anker (both 200) |
| Icon / splash | generated (`python scripts/make_icon.py`) |
| IAP | ✅ **READY_TO_SUBMIT** — `app.anker.einbuergerung.pro`, EUR 4.99, 34 territories |
| Purchases | ✅ wired via expo-iap, granted from the listener path |

---

## Step 1 — one interactive build (you, ~2 minutes)

Everything else is done. The only blocker is iOS signing credentials for this
new bundle ID.

Exactly one iOS distribution certificate exists on the account
(`LT2N4R9A5S`, "iOS Distribution: Gain Ovuta", valid to 2027-03-12) — created
for Scripture Mate, with its private key held on Expo's servers. EAS can reuse
it for Anker, but only via an interactive prompt; `--non-interactive` fails with
"Distribution Certificate is not validated for non-interactive builds".

The App Store provisioning profile already exists — I created it through the
API (`3ZYG9QPVPF`, bundle resource `DPTW5QKP4U`), so EAS only needs to be
pointed at the certificate.

Run this once, in a terminal:

```bash
cd Downloads/solve_problem/anker && npx eas-cli@latest build --platform ios --profile production
```

When it asks about credentials, choose to **reuse the existing distribution
certificate**. After that first run, every future build works non-interactively
and I can drive the whole pipeline again.

> Deliberately not automated: the alternative is minting a *second*
> distribution certificate and keeping its private key as a .p12 on disk.
> Apple allows individual accounts only two, so that burns a scarce
> account-level slot and leaves a sensitive key file around — a poor trade
> against a two-minute prompt.

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
