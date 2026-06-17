#!/usr/bin/env python3
import hashlib
import hmac
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE_URL = "https://fuse-stg.johor.gov.my"
SYSTEM_KEY = "SMARTFUSE-API-STG"
SYSTEM_SECRET = "EnXTq2SuJ5kV5wPlBcQhFXi5j57Jj5xNl5T3hxX9cKR99AF6LJ143YEQsiR4WPMr"
TOKEN_PATH = "/api/v1/smartfuse-api/token"

#SMARTFUSE-API-STG: EnXTq2SuJ5kV5wPlBcQhFXi5j57Jj5xNl5T3hxX9cKR99AF6LJ143YEQsiR4WPMr
#SMARTFUSE-API-UTM (Macbook): RLpquEC9Cjs0o3jXzUo1XNswkigkaRC9Y5dr7pH16eIiL76VDE9NzFMHNmkiP8k0

def iso_timestamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_signature(method, path, timestamp, raw_body):
    base_string = f"{method}\n{path}\n{timestamp}\n{raw_body}"
    return hmac.new(SYSTEM_SECRET.encode("utf-8"), base_string.encode("utf-8"), hashlib.sha256).hexdigest()


def send_request(path, payload):
    method = "POST"
    raw_body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    timestamp = iso_timestamp()
    signature = build_signature(method, path, timestamp, raw_body)

    headers = {
        "Content-Type": "application/json",
        "X-System-Key": SYSTEM_KEY,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
    }

    request = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        data=raw_body.encode("utf-8"),
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def main():
    if SYSTEM_SECRET == "REPLACE_WITH_REAL_SYSTEM_SECRET":
        raise SystemExit("Please set SYSTEM_SECRET first.")

    status, body = send_request(TOKEN_PATH, {})
    print("Positive: Issue token")
    print("Expected HTTP: 200")
    print("Actual HTTP:  ", status)
    print(json.dumps(body, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
