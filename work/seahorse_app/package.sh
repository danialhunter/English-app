#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h:h}"
WRAPPER_DIR="${PROJECT_DIR}/work/mac_wrapper"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "${WRAPPER_DIR}/Info.plist")"
[[ "${VERSION}" == "2.5.0" ]] || { print -u2 "Unexpected release version: ${VERSION}"; exit 1; }
OUTPUT_DIR="${PROJECT_DIR}/outputs/release-${VERSION}"
APP_NAME="EtonHouse English Tracker.app"
DMG_PATH="${OUTPUT_DIR}/EtonHouse-English-Tracker-Mac-${VERSION}.dmg"
ZIP_PATH="${OUTPUT_DIR}/EtonHouse-English-Tracker-Mac-${VERSION}.app.zip"

# Replace generated bundle resources only, never the Application Support data folder.
[[ -f "${WRAPPER_DIR}/Info.plist" && -f "${SCRIPT_DIR}/web/index.html" && ! -L "${WRAPPER_DIR}/web" ]] || exit 1
if [[ -d "${WRAPPER_DIR}/web" ]]; then
  rm -rf "${WRAPPER_DIR}/web"
fi
mkdir -p "${WRAPPER_DIR}/web"
ditto "${SCRIPT_DIR}/web" "${WRAPPER_DIR}/web"
cp "${SCRIPT_DIR}/assets/EtonHouse-AppIcon.icns" "${WRAPPER_DIR}/assets/EtonHouse-AppIcon.icns"

"${WRAPPER_DIR}/build.sh"
mkdir -p "${OUTPUT_DIR}"

STAGING_DIR="$(mktemp -d "${PROJECT_DIR}/work/seahorse-dmg.XXXXXX")"
trap 'rm -rf "${STAGING_DIR}"' EXIT
ditto "${WRAPPER_DIR}/build/${APP_NAME}" "${STAGING_DIR}/${APP_NAME}"
ln -s /Applications "${STAGING_DIR}/Applications"
cp "${SCRIPT_DIR}/Quick Start.txt" "${STAGING_DIR}/Quick Start.txt"
cp "${SCRIPT_DIR}/web/assets/Student names template.xlsx" "${STAGING_DIR}/Student names template.xlsx"

rm -f "${DMG_PATH}" "${ZIP_PATH}"
hdiutil create -volname "EtonHouse English Tracker ${VERSION}" -srcfolder "${STAGING_DIR}" -ov -format UDZO "${DMG_PATH}"
ditto -c -k --sequesterRsrc --keepParent "${WRAPPER_DIR}/build/${APP_NAME}" "${ZIP_PATH}"

codesign --verify --deep --strict "${WRAPPER_DIR}/build/${APP_NAME}"
spctl --assess --type execute --verbose=2 "${WRAPPER_DIR}/build/${APP_NAME}" || true
file "${WRAPPER_DIR}/build/${APP_NAME}/Contents/MacOS/EtonHouseEnglishTracker"
shasum -a 256 "${DMG_PATH}" "${ZIP_PATH}"
