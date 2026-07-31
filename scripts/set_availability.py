"""Bootstrap the app availability record via the App Store Connect API.

The asc CLI can only EDIT an existing availability; creating the first one is
"use the web flow" — which needs interactive credentials. The public API can
do it directly: POST /v2/appAvailabilities with inline territoryAvailability
creates. Signed with the same AuthKey the CLI uses.

Usage: python scripts/set_availability.py APP_ID
"""

import json
import sys
import time
import urllib.request

import jwt  # pyjwt

KEY_PATH = "../rork-scripture-mate/expo/credentials/AuthKey.p8"
KEY_ID = "27A6X9P27C"
ISSUER = "884ed5da-6ca7-44a8-8935-44e24dea4649"
BASE = "https://api.appstoreconnect.apple.com"


def token() -> str:
    now = int(time.time())
    return jwt.encode(
        {"iss": ISSUER, "iat": now, "exp": now + 60 * 15, "aud": "appstoreconnect-v1"},
        open(KEY_PATH).read(),
        algorithm="ES256",
        headers={"kid": KEY_ID},
    )


def call(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(
        BASE + path,
        method=method,
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
        },
        data=json.dumps(body).encode() if body else None,
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main() -> int:
    app_id = sys.argv[1]

    # 1. Every selling territory.
    territories: list[str] = []
    path = "/v1/territories?limit=200"
    while path:
        status, page = call("GET", path)
        if status != 200:
            print("territories fetch failed:", status, json.dumps(page)[:300])
            return 1
        territories += [t["id"] for t in page.get("data", [])]
        nxt = page.get("links", {}).get("next")
        path = nxt.removeprefix(BASE) if nxt else None
    print(f"territories: {len(territories)}")

    # 2. Availability with inline creates for all of them.
    refs = [{"type": "territoryAvailabilities", "id": f"${{{t}}}"} for t in territories]
    included = [
        {
            "type": "territoryAvailabilities",
            "id": f"${{{t}}}",
            "attributes": {"available": True},
            "relationships": {
                "territory": {"data": {"type": "territories", "id": t}}
            },
        }
        for t in territories
    ]
    body = {
        "data": {
            "type": "appAvailabilities",
            "attributes": {"availableInNewTerritories": True},
            "relationships": {
                "app": {"data": {"type": "apps", "id": app_id}},
                "territoryAvailabilities": {"data": refs},
            },
        },
        "included": included,
    }
    status, resp = call("POST", "/v2/appAvailabilities", body)
    if status in (200, 201):
        print("availability created:", resp.get("data", {}).get("id"))
        return 0
    print("create failed:", status, json.dumps(resp)[:800])
    return 1


if __name__ == "__main__":
    sys.exit(main())
