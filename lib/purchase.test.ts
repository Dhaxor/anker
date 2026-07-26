import { describe, expect, test } from "bun:test";
import {
  isCancellation,
  classifyPurchaseError,
  ownsProduct,
  displayablePrice,
  PRODUCT_ID,
} from "./purchase";

describe("cancellation vs failure", () => {
  test("recognises the machine-readable cancellation signals", () => {
    expect(isCancellation({ userCancelled: true })).toBe(true);
    expect(isCancellation({ code: 2 })).toBe(true); // SKErrorPaymentCancelled
    expect(isCancellation({ code: "E_USER_CANCELLED" })).toBe(true);
    expect(isCancellation({ code: "user_cancelled" })).toBe(true);
  });

  test("recognises cancellation text in English and German", () => {
    expect(isCancellation({ message: "The user cancelled the payment" })).toBe(true);
    expect(isCancellation({ message: "Vorgang abgebrochen" })).toBe(true);
    expect(isCancellation(new Error("Purchase cancelled by user"))).toBe(true);
  });

  test("does NOT treat real failures as cancellation", () => {
    expect(isCancellation({ message: "Network connection lost" })).toBe(false);
    expect(isCancellation({ code: "E_UNKNOWN", message: "Store unavailable" })).toBe(false);
    expect(isCancellation({ message: "Payment declined" })).toBe(false);
    expect(isCancellation(null)).toBe(false);
    expect(isCancellation(undefined)).toBe(false);
  });

  test("classify maps to the two outcomes the UI distinguishes", () => {
    // A cancel must never raise an error alert; a failure must.
    expect(classifyPurchaseError({ userCancelled: true })).toBe("cancelled");
    expect(classifyPurchaseError(new Error("network down"))).toBe("failed");
  });
});

describe("restore: does the user actually own it", () => {
  test("finds the product by productId or id", () => {
    expect(ownsProduct([{ productId: PRODUCT_ID }])).toBe(true);
    expect(ownsProduct([{ id: PRODUCT_ID }])).toBe(true);
  });

  test("ignores other products", () => {
    expect(ownsProduct([{ productId: "app.something.else" }])).toBe(false);
    expect(ownsProduct([{ productId: PRODUCT_ID + ".other" }])).toBe(false);
  });

  test("a refunded purchase does NOT restore the entitlement", () => {
    // Otherwise a user could buy, refund, and keep Pro permanently.
    expect(ownsProduct([{ productId: PRODUCT_ID, revocationDate: 1785000000000 }])).toBe(false);
    expect(ownsProduct([{ productId: PRODUCT_ID, revocationDate: "2026-01-01" }])).toBe(false);
    // An explicit null means "not revoked" and must still grant.
    expect(ownsProduct([{ productId: PRODUCT_ID, revocationDate: null }])).toBe(true);
  });

  test("handles an empty or missing payload without throwing", () => {
    expect(ownsProduct([])).toBe(false);
    expect(ownsProduct(null)).toBe(false);
    expect(ownsProduct(undefined)).toBe(false);
  });

  test("finds the product among several owned items", () => {
    expect(
      ownsProduct([
        { productId: "app.other.one" },
        { productId: PRODUCT_ID },
        { productId: "app.other.two" },
      ])
    ).toBe(true);
  });
});

describe("price display", () => {
  test("passes through a real localised price", () => {
    expect(displayablePrice({ displayPrice: "4,99 €" })).toBe("4,99 €");
    expect(displayablePrice({ displayPrice: "$4.99" })).toBe("$4.99");
  });

  test("never returns a price the store did not give us", () => {
    // The paywall omits the price entirely rather than inventing one.
    expect(displayablePrice(undefined)).toBeNull();
    expect(displayablePrice(null)).toBeNull();
    expect(displayablePrice({})).toBeNull();
    expect(displayablePrice({ displayPrice: "" })).toBeNull();
    expect(displayablePrice({ displayPrice: "   " })).toBeNull();
    expect(displayablePrice({ displayPrice: 4.99 as unknown as string })).toBeNull();
  });
});
