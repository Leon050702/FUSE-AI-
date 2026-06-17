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
DATA_PATH = "/api/v1/smartfuse-api/data"

#SMARTFUSE-API-STG: EnXTq2SuJ5kV5wPlBcQhFXi5j57Jj5xNl5T3hxX9cKR99AF6LJ143YEQsiR4WPMr
#SMARTFUSE-API-UTM (Macbook): RLpquEC9Cjs0o3jXzUo1XNswkigkaRC9Y5dr7pH16eIiL76VDE9NzFMHNmkiP8k0

def iso_timestamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_signature(method, path, timestamp, raw_body):
    base_string = f"{method}\n{path}\n{timestamp}\n{raw_body}"
    return hmac.new(SYSTEM_SECRET.encode("utf-8"), base_string.encode("utf-8"), hashlib.sha256).hexdigest()


def post_signed(path, payload, token=None):
    method = "POST"
    raw_body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    timestamp = iso_timestamp()
    signature = build_signature(method, path, timestamp, raw_body)

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-System-Key": SYSTEM_KEY,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        data=raw_body.encode("utf-8"),
        headers=headers,
        method=method,
    )

    def _parse(status, raw_bytes):
        text = raw_bytes.decode("utf-8", errors="replace")
        try:
            return status, json.loads(text), headers
        except json.JSONDecodeError:
            return status, {"_non_json_body": text[:2000]}, headers

    try:
        with urllib.request.urlopen(request) as response:
            return _parse(response.status, response.read())
    except urllib.error.HTTPError as exc:
        return _parse(exc.code, exc.read())
    except urllib.error.URLError as exc:
        return 0, {"_url_error": str(exc)}, headers


def print_headers(title, headers):
    print(title)
    for key in sorted(headers):
        print(f"{key}: {headers[key]}")


def print_section(title):
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def main():
    if SYSTEM_SECRET == "REPLACE_WITH_REAL_SYSTEM_SECRET":
        raise SystemExit("Please set SYSTEM_SECRET first.")

    token_status, token_body, token_headers = post_signed(TOKEN_PATH, {})
    print_section("TOKEN API")
    print("Step 1: Token request HTTP", token_status)
    print("\n")
    print_headers("Headers sent to token API:", token_headers)
    print("\n")
    print("Body received from token API:")
    print(json.dumps(token_body, indent=2, ensure_ascii=False))
    print("\n")
    if token_status != 200:
        return

    token = token_body["data"]["access_token"]
    payload = {
        "user_id": 249,  # Sesuaikan dengan user_id di Staging --> Adam (253), Leong (255), Nazhan (256)
        "nama": "Smart Fuse Test 12/6/26 1",
        "keterangan": "Testing data submission via Backend API",
        "FT_Sistem": [
                        {
                        "macroproses": "Pendaftaran",
                        "general_proses": "Semak Permohonan",
                        "aggregat": 2,
                        "komponen": "GEQ - Generic EQ",
                        "ft_multiplier": 1,
                        "ft_min": 3.7,
                        "ft_ml": 3.9,
                        "ft_max": 4.1,
                        "ft_mmin": 3.7,
                        "ft_mml": 3.9,
                        "ft_mmax": 4.1,
                        "keterangan": "",
                        "ref_ft_id": 11,
                        "status": 1
                        }, 
                        {
                            "macroproses": "Pendaftaran",
                            "general_proses": "Daftar Akaun",
                            "aggregat": 4,
                            "komponen": "MPM - medium 5-7 Generic GPs",
                            "ft_multiplier": 1,
                            "ft_min": 185.8,
                            "ft_ml": 285.9,
                            "ft_max": 385.9,
                            "ft_mmin": 185.8,
                            "ft_mml": 285.9,
                            "ft_mmax": 385.9,
                            "keterangan": "",
                            "ref_ft_id": 22,
                            "status": 1
                        },
                        {
                            "macroproses": "Profil",
                            "general_proses": "Kemaskini Akaun",
                            "aggregat": 2,
                            "komponen": "GEI - Generic EI",
                            "ft_multiplier": 1,
                            "ft_min": 4,
                            "ft_ml": 4.2,
                            "ft_max": 4.4,
                            "ft_mmin": 4,
                            "ft_mml": 4.2,
                            "ft_mmax": 4.4,
                            "keterangan": "",
                            "ref_ft_id": 10,
                            "status": 1
                        },
                    ],
        "FD_Sistem": [
                            {
                                "entiti": "Akaun",
                                "aggregat": 2,
                                "komponen": "GEIF - Generic EIF",
                                "fd_multiplier": 1,
                                "fd_min": 5.2,
                                "fd_ml": 5.4,
                                "fd_max": 5.7,
                                "fd_mmin": 5.2,
                                "fd_mml": 5.4,
                                "fd_mmax": 5.7,
                                "keterangan": "Akaun untuk sistem",
                                "ref_fd_id": 8,
                                "status": 1
                            },
                            {
                                "entiti": "Profil",
                                "aggregat": 2,
                                "komponen": "GILF - Generic ILF",
                                "fd_multiplier": 1,
                                "fd_min": 7.4,
                                "fd_ml": 7.7,
                                "fd_max": 8.1,
                                "fd_mmin": 7.4,
                                "fd_mml": 7.7,
                                "fd_mmax": 8.1,
                                "keterangan": "Profil untuk pengguna",
                                "ref_fd_id": 7,
                                "status": 1
                            },
                        ],
    }

    data_status, data_body, data_headers = post_signed(DATA_PATH, payload, token=token)

    print_section("DATA API")
    print("Step 2 (Positive Test): Submit valid data")
    print("Expected HTTP: 200")
    print("Actual HTTP:  ", data_status)
    print("\n")
    print_headers("Headers sent to data API:", data_headers)
    print("\n")
    print("Body received from data API:")
    print(json.dumps(data_body, indent=2, ensure_ascii=False))
    print("\n")


if __name__ == "__main__":
    main()
