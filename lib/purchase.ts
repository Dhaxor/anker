// Pure purchase decision logic, split out from EntitlementContext so it can be
// tested without a store.
//
// The real StoreKit transaction cannot be exercised on a simulator — Apple
// requires a physical device signed into a sandbox account. What CAN be tested,
// and is where the bugs actually live, is how we interpret what the store hands
// back: which errors mean "the user changed their mind" versus "something
// broke", whether a restore genuinely found our product, and whether a price is
// safe to display.

export const PRODUCT_ID = "app.anker.einbuergerung.pro";

export type PurchaseResult = "purchased" | "cancelled" | "unavailable" | "failed";

/**
 * Did the user cancel, or did the purchase actually fail?
 *
 * This matters for what we show: a cancel is a normal choice and must not
 * raise an error alert, while a real failure should say so. StoreKit surfaces
 * cancellation several ways depending on version and platform layer, and the
 * message may be localised — so match on the stable machine-readable signals
 * first and only then fall back to text.
 */
export function isCancellation(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: string | number; message?: string; userCancelled?: boolean };

  if (e.userCancelled === true) return true;

  // StoreKit / expo-iap codes. SKErrorPaymentCancelled is 2.
  const code = typeof e.code === "string" ? e.code.toLowerCase() : e.code;
  if (code === 2) return true;
  if (typeof code === "string") {
    if (
      code.includes("cancel") ||
      code === "e_user_cancelled" ||
      code === "user_cancelled" ||
      code === "userCancelled".toLowerCase()
    ) {
      return true;
    }
  }

  // Last resort: the message. Covers English and the German the German
  // storefront returns ("abgebrochen").
  const msg = String(e.message ?? error).toLowerCase();
  return /cancel|abgebrochen|abbruch/.test(msg);
}

/** Classify anything thrown by a purchase attempt. */
export function classifyPurchaseError(error: unknown): PurchaseResult {
  return isCancellation(error) ? "cancelled" : "failed";
}

export interface OwnedPurchase {
  productId?: string;
  id?: string;
  /** iOS sometimes reports a revoked/refunded entitlement; never honour it */
  revocationDate?: number | string | null;
}

/**
 * Does this restore payload actually contain our product?
 *
 * Deliberately strict: a refunded purchase carries a revocationDate and must
 * NOT re-grant the entitlement, or a user could refund and keep Pro forever.
 */
export function ownsProduct(
  purchases: readonly OwnedPurchase[] | null | undefined,
  productId: string = PRODUCT_ID
): boolean {
  if (!purchases) return false;
  return purchases.some((p) => {
    const id = p.productId ?? p.id;
    if (id !== productId) return false;
    return p.revocationDate === undefined || p.revocationDate === null;
  });
}

/**
 * A price is only displayable if the store gave us a real, non-empty string.
 * Anything else means we show no price at all rather than inventing one.
 */
export function displayablePrice(product: { displayPrice?: unknown } | undefined | null): string | null {
  const p = product?.displayPrice;
  if (typeof p !== "string") return null;
  const trimmed = p.trim();
  return trimmed.length > 0 ? trimmed : null;
}
