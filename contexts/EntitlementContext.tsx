// Purchase state. Deliberately thin and local: the entitlement is a one-time
// unlock, so there is nothing to sync and no account to create.
//
// The store call sits behind `purchase()` as a seam. Until the App Store
// product exists, `PURCHASES_ENABLED` is false and the seam reports
// unavailable rather than pretending to charge anyone.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntitlementState, canUse, examsRemaining, type Feature } from "@/lib/entitlement";

const PRO_KEY = "anker.pro.v1";
const EXAMS_KEY = "anker.examsTaken.v1";

/** Flipped on once the IAP product is live in App Store Connect. */
export const PURCHASES_ENABLED = false;

export type PurchaseResult = "purchased" | "cancelled" | "unavailable" | "failed";

interface EntitlementValue {
  ready: boolean;
  state: EntitlementState;
  /**
   * Localised price straight from the store (e.g. "4,99 €"), or null when the
   * store has not answered yet. Never hardcode a price: App Store pricing is
   * per-territory and Apple requires the real one be shown before purchase.
   */
  priceLabel: string | null;
  can: (feature: Feature) => boolean;
  examsLeft: number;
  noteExamTaken: () => void;
  purchase: () => Promise<PurchaseResult>;
  restore: () => Promise<PurchaseResult>;
  /** dev/QA only — never reachable from the shipped UI */
  setProForTesting: (v: boolean) => void;
}

const Ctx = createContext<EntitlementValue | null>(null);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [pro, setPro] = useState(false);
  const [examsTaken, setExamsTaken] = useState(0);
  const [priceLabel, setPriceLabel] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    void (async () => {
      try {
        const [p, e] = await AsyncStorage.multiGet([PRO_KEY, EXAMS_KEY]);
        if (stale) return;
        if (p[1] === "1") setPro(true);
        if (e[1]) setExamsTaken(Number(e[1]) || 0);
      } catch {
        // treat an unreadable store as "not purchased"; restore() recovers it
      } finally {
        if (!stale) setReady(true);
      }
    })();
    return () => {
      stale = true;
    };
  }, []);

  const state = useMemo<EntitlementState>(() => ({ pro, examsTaken }), [pro, examsTaken]);

  const noteExamTaken = useCallback(() => {
    setExamsTaken((n) => {
      const next = n + 1;
      void AsyncStorage.setItem(EXAMS_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const grant = useCallback(() => {
    setPro(true);
    void AsyncStorage.setItem(PRO_KEY, "1").catch(() => {});
  }, []);

  // Fetch the localised price as soon as the store is reachable. Until the
  // product exists this stays null and the paywall simply omits the price
  // rather than showing an invented one.
  useEffect(() => {
    if (!PURCHASES_ENABLED) return;
    // Wired to expo-iap getProducts() alongside purchase() below.
    setPriceLabel(null);
  }, []);

  const purchase = useCallback(async (): Promise<PurchaseResult> => {
    if (!PURCHASES_ENABLED) return "unavailable";
    // Wired to expo-iap once the product is created in App Store Connect.
    return "unavailable";
  }, []);

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    if (!PURCHASES_ENABLED) return "unavailable";
    return "unavailable";
  }, []);

  const value = useMemo<EntitlementValue>(
    () => ({
      ready,
      state,
      priceLabel,
      can: (f: Feature) => canUse(f, state),
      examsLeft: examsRemaining(state),
      noteExamTaken,
      purchase,
      restore,
      setProForTesting: (v: boolean) => {
        setPro(v);
        void AsyncStorage.setItem(PRO_KEY, v ? "1" : "0").catch(() => {});
      },
    }),
    [ready, state, priceLabel, noteExamTaken, purchase, restore]
  );

  // `grant` is referenced by the purchase flow once PURCHASES_ENABLED flips.
  void grant;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlement(): EntitlementValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEntitlement must be used inside EntitlementProvider");
  return v;
}
