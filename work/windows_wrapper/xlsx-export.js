const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_XLSX_BYTES = 20_000_000;
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_XLSX_BYTES / 3);

function parseXlsxExport(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.asset !== undefined) {
    throw new Error("The app did not provide a valid Excel report.");
  }
  const { filename, base64 } = payload;
  if (typeof filename !== "string" || !filename || filename !== filename.trim() ||
      Buffer.byteLength(filename, "utf8") > 240 || filename.startsWith(".") ||
      /[\\/:*?"<>|\x00-\x1f\x7f]/.test(filename) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename) ||
      !filename.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Use an Excel report filename ending in .xlsx, without folders or special path characters.");
  }
  for (const value of [payload.mimeType, payload.mime]) {
    if (value !== undefined && value !== XLSX_MIME) throw new Error("The report must use the Excel workbook file type.");
  }
  if (typeof base64 !== "string" || !base64 || base64.length > MAX_BASE64_LENGTH ||
      base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("The Excel report is invalid or larger than 20 MB.");
  }
  const data = Buffer.from(base64, "base64");
  if (!data.length || data.length > MAX_XLSX_BYTES || data.toString("base64") !== base64 ||
      !data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new Error("The Excel report is invalid or larger than 20 MB.");
  }
  return { filename, data, mimeType: XLSX_MIME };
}

module.exports = { parseXlsxExport, XLSX_MIME, MAX_XLSX_BYTES, MAX_BASE64_LENGTH };
