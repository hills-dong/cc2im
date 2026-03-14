#!/usr/bin/env bash
set -euo pipefail

PORT=${1:-9999}
CONFIG="smoke-test-config.yaml"
DB="smoke-test.db"

# Create minimal config
cat > "$CONFIG" <<EOF
lark:
  appId: ""
  appSecret: ""
discord:
  token: ""
projects: []
claude:
  command: echo
  defaultArgs: []
  bufferInterval: 500
  timeout: 5000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
EOF

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$CONFIG" "$DB" "$DB-wal" "$DB-shm"
}
trap cleanup EXIT

CC2IM_CONFIG="$CONFIG" CC2IM_DB="$DB" node packages/cli/dist/cli.js web --port "$PORT" --bind 127.0.0.1 &
SERVER_PID=$!
sleep 3

echo "Testing HTTP API..."
curl -sf http://127.0.0.1:$PORT/api/projects > /dev/null
echo "  GET /api/projects OK"
curl -sf http://127.0.0.1:$PORT/api/config > /dev/null
echo "  GET /api/config OK"
echo "Testing static files..."
curl -sf http://127.0.0.1:$PORT/ | grep -q "<html"
echo "  GET / OK"

echo "All smoke tests passed!"
