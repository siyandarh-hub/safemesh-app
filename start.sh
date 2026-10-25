#!/usr/bin/env bash
# Run SafeMesh on macOS / Linux:  ./start.sh
cd "$(dirname "$0")" || exit 1
[ -f .env ] || node tools/setup.js || exit 1   # first run: generate your secrets
cd backend || exit 1
[ -d node_modules ] || { echo "Installing dependencies (first run only)…"; npm install || exit 1; }
echo "Starting SafeMesh on http://localhost:3847"
exec npm start
