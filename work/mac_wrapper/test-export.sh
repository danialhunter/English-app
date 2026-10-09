#!/bin/zsh
set -euo pipefail
SEAHORSE_SCRIPT_DIR="${0:A:h}"
SEAHORSE_TEST_DIR="$(mktemp -d -t seahorse-export-compile)"
trap 'rmdir "${SEAHORSE_TEST_DIR}" 2>/dev/null || true' EXIT
xcrun swiftc -parse-as-library "${SEAHORSE_SCRIPT_DIR}/Sources/XLSXExport.swift" "${SEAHORSE_SCRIPT_DIR}/Tests/XLSXExportTests.swift" -o "${SEAHORSE_TEST_DIR}/export-tests"
"${SEAHORSE_TEST_DIR}/export-tests" "${SEAHORSE_SCRIPT_DIR}/../seahorse_app/web/assets/Student names template.xlsx"
unlink "${SEAHORSE_TEST_DIR}/export-tests"
