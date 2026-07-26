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
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntitlementState, canUse, examsRemaining, type Feature } from "@/lib/entitlement";
import {
  PRODUCT_ID,
  classifyPurchaseError,
  ownsProduct,
  displayablePrice,
} from "@/lib/purchase";

const PRO_KEY = "anker.pro.v1";
const EXAMS_KEY = "anker.examsTaken.v1";

/** Re-exported so screens keep a single import site. IAP 6794763803. */
export { PRODUCT_ID };

/**
 * Purchases run on iOS only. On web (our verification harness) the store
 * module has no implementation, so every call reports "unavailable" and the
 * paywall degrades to an explanatory alert rather than throwing.
 */
export const PURCHASES_ENABLED = Platform.OS === "ios";

/**
 * expo-iap is required lazily so that web bundles never pull in a native
 * module that cannot load there.
 */
function iap(): typeof import("expo-iap") | null {
  if (!PURCHASES_ENABLED) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-iap") as typeof import("expo-iap");
  } catch {
    return null;
  }
}

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
    const store = iap();
    if (!store) return;
    let cancelled = false;

    // Deliver the entitlement from the listener rather than the requestPurchase
    // return value: this is the path that also fires for purchases Apple
    // completes later (Ask to Buy, interrupted payments).
    const sub = store.purchaseUpdatedListener(async (p) => {
      try {
        await store.finishTransaction({ purchase: p, isConsumable: false });
      } catch {
        // finishing is best-effort; the entitlement still stands
      }
      if (!cancelled) grant();
    });

    void (async () => {
      try {
        await store.initConnection();
        const products = await store.fetchProducts({ skus: [PRODUCT_ID], type: "in-app" });
        const price = displayablePrice((products ?? [])[0] as never);
        if (!cancelled && price) setPriceLabel(price);
      } catch {
        // leave the price unknown; the paywall omits it rather than inventing one
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, [grant]);

  const purchase = useCallback(async (): Promise<PurchaseResult> => {
    const store = iap();
    if (!store) return "unavailable";
    try {
      await store.initConnection();
      await store.requestPurchase({
        request: { apple: { sku: PRODUCT_ID } },
        type: "in-app",
      });
      // The grant happens in purchaseUpdatedListener below, which is the only
      // path Apple guarantees fires for both fresh buys and deferred ones.
      return "purchased";
    } catch (e) {
      // A user changing their mind is not an error worth alerting about.
      return classifyPurchaseError(e);
    }
  }, []);

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    const store = iap();
    if (!store) return "unavailable";
    try {
      await store.initConnection();
      const owned = await store.getAvailablePurchases();
      if (ownsProduct(owned as never)) {
        grant();
        return "purchased";
      }
      return "failed";
    } catch {
      return "failed";
    }
  }, [grant]);

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

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlement(): EntitlementValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEntitlement must be used inside EntitlementProvider");
  return v;
}
