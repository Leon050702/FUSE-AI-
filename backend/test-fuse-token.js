// Quick connection test against the FUSE staging token endpoint.
// Mirrors the stakeholder's 01_positive_token_issue.py exactly, in Node.
// Run: node test-fuse-token.js
const crypto = require("crypto");

const BASE_URL = "https://fuse-stg.johor.gov.my";
const SYSTEM_KEY = "SMARTFUSE-API-STG";
const SYSTEM_SECRET = "EnXTq2SuJ5kV5wPlBcQhFXi5j57Jj5xNl5T3hxX9cKR99AF6LJ143YEQsiR4WPMr";
const TOKEN_PATH = "/api/v1/smartfuse-api/token";

function isoTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildSignature(method, path, timestamp, rawBody) {
  const baseString = `${method}\n${path}\n${timestamp}\n${rawBody}`;
  return crypto.createHmac("sha256", SYSTEM_SECRET).update(baseString, "utf8").digest("hex");
}

async function main() {
  const method = "POST";
  const rawBody = JSON.stringify({});
  const timestamp = isoTimestamp();
  const signature = buildSignature(method, TOKEN_PATH, timestamp, rawBody);

  const r = await fetch(BASE_URL + TOKEN_PATH, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-System-Key": SYSTEM_KEY,
      "X-Timestamp": timestamp,
      "X-Signature": signature,
    },
    body: rawBody,
  });

  const body = await r.json().catch(() => ({}));
  console.log("Positive: Issue token");
  console.log("Expected HTTP: 200");
  console.log("Actual HTTP:  ", r.status);
  console.log(JSON.stringify(body, null, 2));
}

main().catch(e => { console.error("Request failed:", e.message); process.exit(1); });
