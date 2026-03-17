FROM node:18-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/ui/package.json packages/ui/

RUN npm ci

COPY packages/core/ packages/core/
COPY packages/server/ packages/server/
COPY packages/cli/ packages/cli/
COPY packages/ui/ packages/ui/
COPY tsconfig*.json ./

RUN npm run build

# --- Runtime ---
FROM node:18-slim

WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/cli/package.json packages/cli/
COPY --from=builder /app/packages/ui/package.json packages/ui/

COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/packages/core/dist/ packages/core/dist/
COPY --from=builder /app/packages/server/dist/ packages/server/dist/
COPY --from=builder /app/packages/cli/dist/ packages/cli/dist/
COPY --from=builder /app/packages/ui/dist/ packages/ui/dist/

# Copy E2E fixtures (mock Claude, test configs)
COPY test/e2e/fixtures/ e2e/fixtures/
RUN chmod +x e2e/fixtures/mock-claude.sh

# Create project directory for e2e-project
RUN mkdir -p /tmp/e2e /tmp/e2e2

EXPOSE 18081

ENV CC2IM_DB=/tmp/cc2im-e2e.db

CMD ["sh", "-c", "mkdir -p /tmp/e2e /tmp/e2e2 && node -e \"\
const Database = require('better-sqlite3');\
const db = new Database(process.env.CC2IM_DB);\
db.exec('CREATE TABLE IF NOT EXISTS token_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, project_name TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER DEFAULT 0, cache_creation_tokens INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');\
db.prepare('INSERT INTO token_usage (session_id, project_name, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('seed-yesterday', 'e2e-project', 'claude-sonnet', 100, 50, new Date(Date.now() - 86400000).toISOString());\
db.close();\
console.log('Seeded historical token data');\
\" && node packages/cli/dist/cli.js web --port 18081 --bind 0.0.0.0 --config /app/e2e/fixtures/config.e2e.yaml"]
