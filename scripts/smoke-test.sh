#!/usr/bin/env bash
# Smoke Test Script for Operación Manta Cero API
# Usage: ./scripts/smoke-test.sh <API_BASE_URL> <INVITE_CODE>
# Example: ./scripts/smoke-test.sh https://api.example.com/prod MC-98060-B646E-2E482-BCE1F

set -euo pipefail

API_URL="${1:-http://localhost:5173}"
INVITE_CODE="${2:-}"

echo "=========================================================="
echo "  Operación Manta Cero — API Smoke Test"
echo "  Target URL: $API_URL"
echo "=========================================================="

COOKIE_FILE=$(mktemp)
trap 'rm -f "$COOKIE_FILE"' EXIT

if [ -z "$INVITE_CODE" ]; then
  if [ -f ".invite-code.local" ]; then
    INVITE_CODE=$(head -n 1 .invite-code.local)
    echo "Using local code from .invite-code.local"
  else
    echo "Error: Please provide an invitation code as second argument."
    exit 1
  fi
fi

# 1. Login
echo "[1/4] Authenticating with invitation code..."
LOGIN_RESP=$(curl -s -c "$COOKIE_FILE" -X POST "$API_URL/api/v1/auth/session" \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"$INVITE_CODE\"}")

echo "Response: $LOGIN_RESP"

# 2. Check Session
echo "[2/4] Verifying active session..."
curl -s -b "$COOKIE_FILE" "$API_URL/api/v1/auth/session"

# 3. Submit Job
echo ""
echo "[3/4] Submitting simulation job..."
JOB_RESP=$(curl -s -b "$COOKIE_FILE" -X POST "$API_URL/api/v1/jobs" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-$(date +%s)" \
  -d '{"params":{"days":30,"monteCarloRuns":50},"visibility":"PRIVATE"}')

echo "Job response: $JOB_RESP"

# 4. Check Shared Jobs
echo ""
echo "[4/4] Listing shared jobs gallery..."
curl -s -b "$COOKIE_FILE" "$API_URL/api/v1/jobs/shared"
echo ""
echo "Smoke test completed successfully."
