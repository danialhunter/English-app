#!/bin/zsh
set -euo pipefail
SEAHORSE_SCRIPT_DIR="${0:A:h}"
SEAHORSE_TEST_DIR="$(mktemp -d -t seahorse-storage-compile)"
trap 'rmdir "${SEAHORSE_TEST_DIR}" 2>/dev/null || true' EXIT
xcrun swiftc -parse-as-library "${SEAHORSE_SCRIPT_DIR}/Sources/TrackerStorage.swift" "${SEAHORSE_SCRIPT_DIR}/Tests/StorageTests.swift" -o "${SEAHORSE_TEST_DIR}/storage-tests"
"${SEAHORSE_TEST_DIR}/storage-tests"
unlink "${SEAHORSE_TEST_DIR}/storage-tests"
