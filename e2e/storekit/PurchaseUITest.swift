import XCTest
import StoreKitTest

/// The "test payment" a preview platform simulates at the JavaScript layer,
/// done properly: the purchase completes through the real native StoreKit
/// machinery against Apple's local test store (StoreKit Testing).
///
/// Proves the hop nothing else covers without a physical device:
///   completed transaction → purchaseUpdatedListener → grant → persistence.
///
/// Deliberately out of scope: Apple's real billing servers and a signed-in
/// account. Only the App Store sandbox on a physical device reaches those,
/// and App Review performs a real purchase during review regardless.
final class PurchaseUITest: XCTestCase {

  private func el(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  private func waitGone(_ e: XCUIElement, timeout: TimeInterval) -> Bool {
    let exp = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "exists == false"), object: e)
    return XCTWaiter().wait(for: [exp], timeout: timeout) == .completed
  }

  func testPurchaseUnlocksProAndPersists() throws {
    let session = try SKTestSession(configurationFileNamed: "Anker")
    session.resetToDefaultState()
    session.disableDialogs = true
    session.clearTransactions()

    let app = XCUIApplication()
    app.launch()

    // First launch shows the Bundesland picker.
    let land = el(app, "land-Bayern")
    if land.waitForExistence(timeout: 30) {
      land.tap()
    }

    // Schwachstellen is Pro-gated: a free user must land on the paywall.
    let review = el(app, "open-review")
    XCTAssertTrue(review.waitForExistence(timeout: 30), "home never rendered")
    review.tap()

    let buy = el(app, "paywall-buy")
    XCTAssertTrue(buy.waitForExistence(timeout: 20),
                  "free user was not gated to the paywall")
    buy.tap()

    // disableDialogs auto-approves the test transaction; if the confirmation
    // sheet appears anyway, confirm it explicitly.
    let confirm = app.buttons["Purchase"].firstMatch
    if confirm.waitForExistence(timeout: 5) {
      confirm.tap()
    }

    // A successful grant pops the paywall (router.back()).
    XCTAssertTrue(waitGone(buy, timeout: 30),
                  "paywall did not dismiss after a completed purchase")

    // The gate must now be open.
    review.tap()
    XCTAssertTrue(el(app, "review-back").waitForExistence(timeout: 20),
                  "purchase completed but weak-spots is still gated")

    // And the entitlement must survive a cold start (AsyncStorage).
    app.terminate()
    app.launch()
    let reviewAgain = el(app, "open-review")
    XCTAssertTrue(reviewAgain.waitForExistence(timeout: 30),
                  "home missing after relaunch")
    reviewAgain.tap()
    XCTAssertTrue(el(app, "review-back").waitForExistence(timeout: 20),
                  "entitlement did not persist across relaunch")
  }
}
