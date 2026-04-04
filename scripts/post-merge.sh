#!/bin/bash
set -e
pnpm install
pnpm --filter db push
/home/runner/workspace/artifacts/api-server/node_modules/.bin/playwright install chromium 2>/dev/null || true
