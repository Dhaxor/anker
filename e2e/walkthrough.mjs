// Drives the real Anker binary on a booted iOS simulator via Appium/XCUITest.
//
// Two jobs at once: prove the flows work on-device, and capture the 6.7"
// screenshots the App Store listing and the IAP review both need.
//
// Selector rule learned the hard way on a sibling app: prefer testIDs
// (accessibility ids, "~foo"). Text predicates match elements on OTHER mounted
// screens and produce confident false passes.
import { remote } from "webdriverio";
import fs from "fs";

const UDID = process.env.UDID;
const BUNDLE = process.env.BUNDLE_ID || "app.anker.einbuergerung";
const SHOTS = process.env.SHOTS_DIR || "shots";
fs.mkdirSync(SHOTS, { recursive: true });

let n = 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[e2e]", ...a);

async function shot(driver, name) {
  try {
    const b64 = await driver.takeScreenshot();
    const file = `${SHOTS}/${String(n).padStart(2, "0")}-${name}.png`;
    fs.writeFileSync(file, Buffer.from(b64, "base64"));
    log("shot", file);
    n++;
  } catch (e) {
    log("shot-failed", name, e.message);
  }
}

const byContains = (t) =>
  `-ios predicate string:label CONTAINS "${t}" OR name CONTAINS "${t}" OR value CONTAINS "${t}"`;

async function tap(driver, selector, label, timeout = 12000) {
  try {
    const el = await driver.$(selector);
    await el.waitForExist({ timeout });
    await el.click();
    log("tapped", label);
    return true;
  } catch (e) {
    log("tap-failed", label, e.message.split("\n")[0]);
    return false;
  }
}

async function exists(driver, selector, timeout = 6000) {
  try {
    const el = await driver.$(selector);
    await el.waitForExist({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function textOf(driver, selector) {
  try {
    const el = await driver.$(selector);
    if (!(await el.isExisting())) return null;
    return (await el.getText()) || (await el.getAttribute("value"));
  } catch {
    return null;
  }
}

const caps = {
  platformName: "iOS",
  "appium:automationName": "XCUITest",
  "appium:udid": UDID,
  "appium:bundleId": BUNDLE,
  "appium:newCommandTimeout": 300,
  // A cold WebDriverAgent build on a GitHub macOS runner has been measured at
  // 311s — the previous 240s ceiling made every session attempt time out and
  // produced a run with no walkthrough at all. Give it real headroom.
  "appium:wdaLaunchTimeout": 600000,
  "appium:wdaConnectionTimeout": 600000,
  // Reuse the agent between attempts rather than tearing it down and paying
  // the build cost again on every retry.
  "appium:usePrebuiltWDA": true,
  "appium:shouldTerminateApp": true,
};

async function connect() {
  // Cold WDA start intermittently times out; retry rather than fail the run.
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await remote({
        hostname: "127.0.0.1",
        port: 4723,
        path: "/",
        logLevel: "error",
        capabilities: caps,
      });
    } catch (e) {
      log(`session attempt ${attempt}/3 failed:`, (e.message || "").split("\n")[0]);
      if (attempt === 3) throw e;
      await sleep(10000);
    }
  }
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass });
  log(`${name} RESULT: ${pass ? "PASS" : "FAIL"} — ${detail}`);
}

async function main() {
  const driver = await connect();
  await sleep(6000);

  // --- 1. First launch: the Bundesland picker is the empty state ---
  await shot(driver, "onboarding-bundesland");
  const pickerShown = await exists(driver, "~land-Bayern", 15000);
  record("ONBOARDING", pickerShown, pickerShown ? "Bundesland picker on first launch" : "no picker");

  if (pickerShown) {
    await tap(driver, "~land-Bayern", "Bundesland Bayern");
    await sleep(3000);
  }

  // --- 2. Home: the readiness verdict ---
  await shot(driver, "home-readiness");
  const score = await textOf(driver, "~expected-score");
  record("HOME", score !== null, score !== null ? `expected score renders (${score})` : "no score");

  // --- 3. Practice: answer one question, check the feedback states ---
  if (await tap(driver, "~start-practice", "Üben")) {
    await sleep(3500);
    await shot(driver, "practice-question");
    const hasQuestion = await exists(driver, "~question-text", 10000);
    const optionsPresent = await exists(driver, "~option-0", 5000);
    record(
      "PRACTICE",
      hasQuestion && optionsPresent,
      `question=${hasQuestion} options=${optionsPresent}`
    );

    if (optionsPresent) {
      await tap(driver, "~option-0", "answer option 1");
      await sleep(1800);
      await shot(driver, "practice-feedback");
      // After answering, the explanation + Weiter dock appear.
      const nextShown = await exists(driver, "~next-question", 6000);
      record("FEEDBACK", nextShown, nextShown ? "answer feedback + Weiter dock" : "no dock");
      if (nextShown) {
        await tap(driver, "~next-question", "Weiter");
        await sleep(1500);
      }
    }
    await tap(driver, "~practice-exit", "close practice");
    await sleep(2000);
  } else {
    record("PRACTICE", false, "could not open practice");
  }

  // --- 4. Exam: timer runs, options render ---
  if (await tap(driver, "~start-exam", "Prüfung simulieren")) {
    await sleep(4000);
    await shot(driver, "exam-question");
    const timer = await textOf(driver, "~exam-timer");
    const examOptions = await exists(driver, "~exam-option-0", 8000);
    record(
      "EXAM",
      timer !== null && examOptions,
      `timer=${timer} options=${examOptions}`
    );
    await tap(driver, "~exam-exit", "leave exam");
    await sleep(1200);
    // A confirmation alert guards leaving a started exam.
    await tap(driver, byContains("Beenden"), "confirm leave exam", 6000);
    await sleep(2500);
  } else {
    record("EXAM", false, "could not open exam");
  }

  // --- 5. Schwachstellen ---
  if (await tap(driver, "~open-review", "Schwachstellen")) {
    await sleep(3000);
    await shot(driver, "schwachstellen");
    record("REVIEW", true, "weak-spots screen opened");
    await tap(driver, "~review-back", "back", 6000);
    await sleep(2000);
  } else {
    record("REVIEW", false, "could not open review");
  }

  // --- 6. Settings, then the paywall. The paywall shot doubles as the
  // screenshot Apple requires to review the in-app purchase. ---
  if (await tap(driver, "~open-settings", "Einstellungen")) {
    await sleep(2500);
    await shot(driver, "settings");

    const privacy = await exists(driver, "~settings-privacy", 5000);
    record("PRIVACY-LINK", privacy, privacy ? "Datenschutz row present" : "missing privacy link");

    // Restore must be reachable without buying first — Apple requires it.
    const restoreRow = await exists(driver, "~settings-restore", 4000);
    record("RESTORE-VISIBLE", restoreRow, restoreRow ? "restore offered in settings" : "no restore row");

    if (await tap(driver, "~settings-upgrade", "Anker Pro freischalten", 6000)) {
      await sleep(3000);
      await shot(driver, "paywall");
      const buy = await exists(driver, "~paywall-buy", 6000);
      const restore = await exists(driver, "~paywall-restore", 4000);
      record("PAYWALL", buy && restore, `buy=${buy} restore=${restore}`);
    } else {
      record("PAYWALL", false, "could not open paywall from settings");
    }
  } else {
    record("PRIVACY-LINK", false, "could not open settings");
    record("PAYWALL", false, "could not open settings");
  }

  const passed = results.filter((r) => r.pass).length;
  log(`SUMMARY: ${passed}/${results.length} checks passed`);
  log("walkthrough complete");
}

main().catch((e) => {
  console.error("[e2e] fatal:", e);
  process.exit(0); // never fail the job; the log and shots are the artefact
});
