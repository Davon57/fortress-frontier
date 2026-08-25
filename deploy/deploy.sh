#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/fortress-frontier}"
BRANCH="${BRANCH:-main}"
LOG_FILE="${LOG_FILE:-/www/wwwlogs/fortress-frontier-deploy.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/fortress-frontier-deploy.lock}"

mkdir -p "$(dirname "$LOG_FILE")"
exec >> "$LOG_FILE" 2>&1
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "[$(date '+%F %T')] deployment already running"; exit 0; }

echo "[$(date '+%F %T')] deploy started"
cd "$PROJECT_DIR"
export HOME="${HOME:-/root}"

GIT=(git -c "safe.directory=$PROJECT_DIR")
"${GIT[@]}" fetch origin "$BRANCH"
"${GIT[@]}" checkout "$BRANCH"
"${GIT[@]}" pull --ff-only origin "$BRANCH"

npm ci
npm run build

echo "[$(date '+%F %T')] deploy finished"
