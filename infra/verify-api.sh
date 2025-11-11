#!/usr/bin/env bash
set -euo pipefail

# Simple integration check for the PricePulse API.
# Usage:
#   ./verify-api.sh          # run OPTIONS and GET
#   ./verify-api.sh --post   # also run a POST which will create a test item

API_ENDPOINT="${API_ENDPOINT:-https://rsqbj2qxlj.execute-api.us-east-1.amazonaws.com}"
ORIGIN="${ORIGIN:-https://price.ogulcanaydogan.com}"
X_USER="${X_USER_ID:-guest-user}"

print_usage() {
  cat <<EOF
Usage: $0 [--post] [--help]

Options:
  --post     Send a test POST (will create an item in DynamoDB)
  --help     Show this help

Environment variables:
  API_ENDPOINT   Override the API root (default: ${API_ENDPOINT})
  ORIGIN         Override Origin header (default: ${ORIGIN})
  X_USER_ID      Override X-User-Id header (default: ${X_USER})
EOF
}

DO_POST=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --post) DO_POST=true; shift ;;
    --help) print_usage; exit 0 ;;
    *) echo "Unknown arg: $1"; print_usage; exit 2 ;;
  esac
done

echo "API endpoint: $API_ENDPOINT"
echo "Origin: $ORIGIN"
echo "X-User-Id: $X_USER"

echo
echo "== OPTIONS (CORS preflight) =="
curl -i -sS -X OPTIONS "$API_ENDPOINT/items" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: GET" || true

echo
echo "== GET /items =="
curl -i -sS -X GET "$API_ENDPOINT/items" \
  -H "X-User-Id: $X_USER" \
  -H "Origin: $ORIGIN" || true

if [ "$DO_POST" = true ]; then
  echo
  echo "== POST /items (creating a test item) =="
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  PAYLOAD=$(cat <<JSON
{
  "url": "https://example.com/test-${TS}",
  "product_name": "verify-api test ${TS}",
  "store": "example.com",
  "last_price": 19.99,
  "target_price": 14.99,
  "frequency_minutes": 1440,
  "notification_email": "test+verify@ogulcanaydogan.com"
}
JSON
)

  echo "Request payload: $PAYLOAD"
  curl -i -sS -X POST "$API_ENDPOINT/items" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: $X_USER" \
    -H "Origin: $ORIGIN" \
    -d "$PAYLOAD" || true
fi

echo
echo "Done."
