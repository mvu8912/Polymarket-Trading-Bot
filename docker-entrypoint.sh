#!/bin/sh
set -eu

if [ -d /app ]; then
  cd /app
fi

if [ ! -f dist/cli.js ]; then
  echo "[entrypoint] dist/cli.js not found; building TypeScript output..."
  npm run build
fi

exec node dist/cli.js start --config config.yaml
