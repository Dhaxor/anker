"""Attempt to submit the IAP for review via the public API.

POST /v1/inAppPurchaseSubmissions. For a FIRST in-app purchase Apple may
require it to ride with a version submission (as with first subscriptions);
this script exists to get that answer from Apple rather than assume it.

Usage: python scripts/submit_iap.py IAP_ID
"""

import json
import sys
import time
import urllib.request

import jwt

KEY_PATH = "../rork-scripture-mate/expo/credentials/AuthKey.p8"
KEY_ID = "27A6X9P27C"
ISSUER = "884ed5da-6ca7-44a8-8935-44e24dea4649"
BASE = "https://api.appstoreconnect.apple.com"


def token() -> str:
    now = int(time.time())
    return jwt.encode(
        {"iss": ISSUER, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
        open(KEY_PATH).read(),
        algorithm="ES256",
        headers={"kid": KEY_ID},
    )


def main() -> int:
    iap_id = sys.argv[1]
    body = {
        "data": {
            "type": "inAppPurchaseSubmissions",
            "relationships": {
                "inAppPurchaseV2": {
                    "data": {"type": "inAppPurchases", "id": iap_id}
                }
            },
        }
    }
    req = urllib.request.Request(
        BASE + "/v1/inAppPurchaseSubmissions",
        method="POST",
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
        },
        data=json.dumps(body).encode(),
    )
    try:
        with urllib.request.urlopen(req) as r:
            print("HTTP", r.status)
            print(json.dumps(json.loads(r.read() or b"{}"), indent=2)[:600])
            return 0
    except urllib.error.HTTPError as e:
        print("HTTP", e.code)
        print(json.dumps(json.loads(e.read() or b"{}"), indent=2)[:900])
        return 1


if __name__ == "__main__":
    sys.exit(main())
