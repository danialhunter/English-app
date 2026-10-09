#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
BUILD_DIR="${SCRIPT_DIR}/build"
APP_BUNDLE="${BUILD_DIR}/EtonHouse English Tracker.app"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"

mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}/web"
for SEAHORSE_ARCH in arm64 x86_64; do
  xcrun swiftc \
  -parse-as-library \
  -target "${SEAHORSE_ARCH}-apple-macosx13.0" \
  -framework AppKit \
  -framework Foundation \
  -framework UniformTypeIdentifiers \
  -framework WebKit \
  "${SCRIPT_DIR}/Sources/main.swift" \
  "${SCRIPT_DIR}/Sources/TrackerStorage.swift" \
  "${SCRIPT_DIR}/Sources/XLSXExport.swift" \
  -o "${BUILD_DIR}/EtonHouseEnglishTracker-${SEAHORSE_ARCH}"
done
xcrun lipo -create "${BUILD_DIR}/EtonHouseEnglishTracker-arm64" "${BUILD_DIR}/EtonHouseEnglishTracker-x86_64" -output "${MACOS_DIR}/EtonHouseEnglishTracker"

cp "${SCRIPT_DIR}/Info.plist" "${CONTENTS_DIR}/Info.plist"
# The web directory is generated package content, not saved classroom data.
[[ "${RESOURCES_DIR}" == "${SCRIPT_DIR}/build/EtonHouse English Tracker.app/Contents/Resources" && ! -L "${RESOURCES_DIR}/web" ]] || exit 1
rm -rf "${RESOURCES_DIR}/web"
ditto "${SCRIPT_DIR}/web" "${RESOURCES_DIR}/web"
cp "${SCRIPT_DIR}/assets/EtonHouse-AppIcon.icns" "${RESOURCES_DIR}/AppIcon.icns"

codesign --force --deep --sign - "${APP_BUNDLE}"

echo "Built: ${APP_BUNDLE}"
file "${MACOS_DIR}/EtonHouseEnglishTracker"
plutil -lint "${CONTENTS_DIR}/Info.plist"
codesign --verify --deep --strict "${APP_BUNDLE}"
