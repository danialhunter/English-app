#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
cd "${SCRIPT_DIR}"
npm ci
npm test
npm run dist:win
