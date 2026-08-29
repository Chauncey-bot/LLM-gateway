#!/usr/bin/env bash

# Reusable subscription-plan creation skill (production-oriented)
# Usage:
#   price_cny and exactly one of daily_usd/monthly_usd are required inputs.
#
# Example:
#   ADMIN_EMAIL=admin@zhisales.com ADMIN_PASSWORD='***' \\
#   bash docs/plans/add-subscription-plan.sh \
#     --name coding-plan-daily-2000 \
#     --price-cny 5000 \
#     --daily-usd 2000 \
#     --copy-from 18 \
#     --assign-user-id 22 \
#     --validity-days 30

set -euo pipefail

API_BASE="${API_BASE:-https://www.zhisales.com}"
EMAIL="${ADMIN_EMAIL:-}"
PASSWORD="${ADMIN_PASSWORD:-}"
NAME="${NAME:-}"
PLATFORM="${PLATFORM:-openai}"
RATE_MULTIPLIER="${RATE_MULTIPLIER:-2.1}"
PRICE_CNY=""
DAILY_USD=""
MONTHLY_USD=""
COPY_FROM_GROUP_ID="${COPY_FROM_GROUP_ID:-18}"
ASSIGN_USER_ID="${ASSIGN_USER_ID:-}"
VALIDITY_DAYS="${VALIDITY_DAYS:-30}"
DESCRIPTION="${DESCRIPTION:-}"

usage() {
  cat <<'EOF'
Usage:
  bash docs/plans/add-subscription-plan.sh \
  --price-cny <price in RMB> \
  (--daily-usd <daily limit in USD> | --monthly-usd <monthly limit in USD>) \
    --name <optional group name> \
    --assign-user-id <optional user id> \
    --validity-days <optional days, default 30> \
    --copy-from <optional source group id, default 18> \
    --platform <optional platform, default openai> \
    --rate-multiplier <optional, default 2.1>

Required:
  ADMIN_EMAIL, ADMIN_PASSWORD env vars must be set, and --price-cny plus exactly one quota limit

Optional:
  DESCRIPTION (default: generated from the selected daily/monthly quota limit)
  API_BASE (default: https://www.zhisales.com)
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="${2:?}"; shift 2 ;;
    --price-cny) PRICE_CNY="${2:?}"; shift 2 ;;
    --daily-usd) DAILY_USD="${2:?}"; shift 2 ;;
    --monthly-usd) MONTHLY_USD="${2:?}"; shift 2 ;;
    --platform) PLATFORM="${2:?}"; shift 2 ;;
    --rate-multiplier) RATE_MULTIPLIER="${2:?}"; shift 2 ;;
    --copy-from) COPY_FROM_GROUP_ID="${2:?}"; shift 2 ;;
    --assign-user-id) ASSIGN_USER_ID="${2:?}"; shift 2 ;;
    --validity-days) VALIDITY_DAYS="${2:?}"; shift 2 ;;
    --description) DESCRIPTION="${2:?}"; shift 2 ;;
    *) usage ;;
  esac
done

if [[ -z "$EMAIL" || -z "$PASSWORD" || -z "$PRICE_CNY" ]]; then
  usage
fi

if [[ -n "$DAILY_USD" && -n "$MONTHLY_USD" ]] || [[ -z "$DAILY_USD" && -z "$MONTHLY_USD" ]]; then
  echo "provide exactly one of --daily-usd or --monthly-usd" >&2
  exit 1
fi

if [[ -z "$NAME" ]]; then
  if [[ -n "$MONTHLY_USD" ]]; then
    NAME="coding-plan-monthly-${MONTHLY_USD}"
  else
    NAME="coding-plan-daily-${DAILY_USD}"
  fi
fi

if [[ -z "$DESCRIPTION" ]]; then
  if [[ -n "$MONTHLY_USD" ]]; then
    DESCRIPTION="${PRICE_CNY} RMB per month, ${MONTHLY_USD} USD monthly limit."
  else
    DESCRIPTION="${PRICE_CNY} RMB per month, ${DAILY_USD} USD daily limit."
  fi
fi

DAILY_LIMIT_PAYLOAD="${DAILY_USD:-0}"
MONTHLY_LIMIT_PAYLOAD="${MONTHLY_USD:-0}"

login_payload=$(cat <<EOF
{"email":"$EMAIL","password":"$PASSWORD"}
EOF
)

login_resp=$(curl -sS -X POST "$API_BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "$login_payload")

TOKEN=$(printf '%s' "$login_resp" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
if [[ -z "$TOKEN" ]]; then
  echo "login failed: $login_resp" >&2
  exit 1
fi

create_payload=$(cat <<EOF
{
  "name":"$NAME",
  "description":"$DESCRIPTION",
  "platform":"$PLATFORM",
  "rate_multiplier":$RATE_MULTIPLIER,
  "is_exclusive":true,
  "subscription_type":"subscription",
  "daily_limit_usd":$DAILY_LIMIT_PAYLOAD,
  "weekly_limit_usd":0,
  "monthly_limit_usd":$MONTHLY_LIMIT_PAYLOAD,
  "copy_accounts_from_group_ids":[$COPY_FROM_GROUP_ID],
  "default_mapped_model":"gpt-5.4",
  "allow_messages_dispatch":false,
  "mcp_xml_inject":true,
  "allow_image_generation":true
}
EOF
)

create_resp=$(curl -sS -X POST "$API_BASE/api/v1/admin/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$create_payload")

GROUP_ID=$(printf '%s' "$create_resp" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
if [[ -z "$GROUP_ID" ]]; then
  echo "create group failed: $create_resp" >&2
  exit 1
fi

echo "created group_id=$GROUP_ID"

if [[ -n "$ASSIGN_USER_ID" ]]; then
  assign_payload=$(cat <<EOF
{
  "user_id":$ASSIGN_USER_ID,
  "group_id":$GROUP_ID,
  "validity_days":$VALIDITY_DAYS
}
EOF
)
  assign_resp=$(curl -sS -X POST "$API_BASE/api/v1/admin/subscriptions/assign" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$assign_payload")
  echo "$assign_resp" | sed -n '1,200p'
fi

echo "done"
