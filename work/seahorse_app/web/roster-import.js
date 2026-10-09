/* Offline roster preview. This module never changes classes, children, or practice records. */
(function (global) {
  "use strict";

  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_STUDENTS = 500;
  const MAX_SHEET_ROWS = 10000;
  const MAX_COLUMNS = 60;
  const aliases = {
    englishName: ["English name", "English", "Student name", "Child name", "Name", "英文名", "英文名字", "英语名", "英文姓名"],
    chineseName: ["Chinese name", "Chinese", "中文名", "中文名字", "中文姓名", "姓名", "幼儿姓名"],
    studentCode: ["Student ID", "Student code", "Child ID", "ID", "学号", "学生编号", "编号"],
    startingAge: ["Starting age", "Starting age band", "Age band", "Age group", "Age", "起始年龄", "年龄段", "年龄"]
  };
  const normalize = value => String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  const key = value => normalize(value).toLowerCase().replace(/[\s_\-()（）]/g, "");
  const headerFields = new Map(Object.entries(aliases).flatMap(([field, names]) => names.map(name => [key(name), field])));
  const fail = message => { throw new Error(message); };

  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", quoted = false, closed = false;
    const pushField = () => { row.push(field); field = ""; closed = false; };
    const pushRow = () => {
      pushField();
      rows.push(row);
      row = [];
      if (rows.length > MAX_SHEET_ROWS) fail("The file has too many rows. Keep the list under 10,000 rows and 500 children.");
    };
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') { quoted = false; closed = true; }
        else field += char;
      } else if (char === ',' || char === '\n' || char === '\r') {
        if (char === ',') pushField();
        else { pushRow(); if (char === '\r' && text[i + 1] === '\n') i++; }
      } else if (char === '"') {
        if (field || closed) fail(`Row ${rows.length + 1}: a quotation mark is misplaced. Save the sheet as Excel (.xlsx) or CSV UTF-8 again.`);
        quoted = true;
      } else {
        if (closed && !/\s/.test(char)) fail(`Row ${rows.length + 1}: unexpected text after a quoted value.`);
        if (!closed) field += char;
      }
      if (row.length > MAX_COLUMNS || field.length > 10000) fail(`Row ${rows.length + 1}: this does not look like a student-name list. Please use the template.`);
    }
    if (quoted) fail(`Row ${rows.length + 1}: a quoted value is not closed. Save the file as Excel (.xlsx) or CSV UTF-8 again.`);
    if (field || row.length || closed) pushRow();
    return rows;
  }

  // Reject large expanded archives before the spreadsheet reader allocates their contents.
  function checkXlsxArchive(bytes) {
    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) fail("This is not an Excel .xlsx file. Open it in Excel and use Save As > Excel Workbook (.xlsx).");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--) {
      if (view.getUint32(pos, true) === 0x06054b50 && pos + 22 + view.getUint16(pos + 20, true) === bytes.length) { end = pos; break; }
    }
    if (end < 0) fail("The Excel file is damaged or incomplete. Save a fresh .xlsx copy and try again.");
    const count = view.getUint16(end + 10, true);
    let cursor = view.getUint32(end + 16, true), total = 0;
    if (count > 2000 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) fail("This workbook is too complex. Copy the names into the student-name template.");
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) fail("The Excel file is damaged. Save a fresh .xlsx copy and try again.");
      if (view.getUint16(cursor + 8, true) & 1) fail("Password-protected files cannot be imported. Save an unprotected copy first.");
      total += view.getUint32(cursor + 24, true);
      if (total > 25 * 1024 * 1024) fail("This workbook contains too much extra content. Copy only the student names into the template.");
      cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    }
    if (cursor !== end) fail("This Excel file uses an unsupported archive format. Save a fresh .xlsx copy in Excel.");
  }

  function readXlsx(bytes) {
    checkXlsxArchive(bytes);
    if (!global.XLSX?.read) fail("The Excel reader could not load. Please reopen the app or import a CSV UTF-8 file.");
    let book;
    try {
      book = global.XLSX.read(bytes, { type: "array", bookSheets: true, cellHTML: false });
      const sheetName = book.SheetNames.find(name => ["students", "studentnames", "children", "名单", "学生名单"].includes(key(name))) || book.SheetNames[0];
      if (!sheetName) fail("The Excel file does not contain a worksheet.");
      book = global.XLSX.read(bytes, { type: "array", sheets: sheetName, sheetRows: MAX_SHEET_ROWS + 1, cellFormula: true, cellHTML: false, cellDates: true });
      const sheet = book.Sheets[sheetName];
      if (!sheet?.["!ref"]) return { rows: [], warnings: [] };
      const range = global.XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
      if (range.e.r >= MAX_SHEET_ROWS || range.e.c >= MAX_COLUMNS) fail("The worksheet is too large. Use at most 500 children and remove unused rows or columns outside the list.");
      const rows = [];
      for (let r = 0; r <= range.e.r; r++) {
        const values = [];
        for (let c = 0; c <= range.e.c; c++) {
          const cell = sheet[global.XLSX.utils.encode_cell({ r, c })];
          values.push(cell ? { value: cell.w ?? cell.v ?? "", formula: !!cell.f, type: cell.t } : "");
        }
        rows.push(values);
      }
      const extra = book.SheetNames.filter(name => name !== sheetName && key(name) !== "instructions");
      return { rows, warnings: extra.length ? [`Only the “${sheetName}” worksheet will be imported. Other worksheets are ignored.`] : [] };
    } catch (error) {
      if (/password|encrypt/i.test(error.message)) fail("Password-protected files cannot be imported. Save an unprotected copy first.");
      if (/too large|at most|does not contain/i.test(error.message)) throw error;
      fail("The Excel file could not be read. Open it in Excel, save a fresh .xlsx copy, and try again.");
    }
  }

  function validateRows(input, warnings) {
    const cellValue = cell => normalize(cell && typeof cell === "object" ? cell.value : cell);
    const headerIndex = input.findIndex(row => row.some(cell => cellValue(cell)));
    if (headerIndex < 0) fail("The file is empty. Add at least one child's name below the template headings.");
    const columns = new Map(), ignored = [];
    input[headerIndex].forEach((cell, index) => {
      const value = cellValue(cell);
      if (!value) return;
      const field = headerFields.get(key(value));
      if (!field) { ignored.push(value); return; }
      if (columns.has(field)) fail(`Row ${headerIndex + 1}: “${value}” repeats a name-list column. Keep only one column for each heading.`);
      columns.set(field, index);
    });
    if (!columns.has("englishName") && !columns.has("chineseName")) fail(`Row ${headerIndex + 1}: add an “English name” or “Chinese name” heading. You can download the blank student-name template from the app.`);
    if (ignored.length) warnings.push(`Extra columns are ignored: ${ignored.slice(0, 5).join(", ")}${ignored.length > 5 ? ", …" : ""}.`);
    const rows = [], issues = [], ids = new Map(), names = new Map();
    for (let index = headerIndex + 1; index < input.length; index++) {
      const source = input[index], rowNumber = index + 1;
      if (!source.some(cell => cellValue(cell))) continue;
      const row = { englishName: "", chineseName: "", studentCode: "" };
      for (const [field, column] of columns) {
        const cell = source[column], value = cellValue(cell);
        if (cell?.formula || cell?.type === "e" || value.startsWith("=")) issues.push(`Row ${rowNumber}: use plain text in “${aliases[field][0]}”, not a formula or an Excel error.`);
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) issues.push(`Row ${rowNumber}: remove unusual control characters from “${aliases[field][0]}”.`);
        if (field === "startingAge") {
          if (value) {
            const ageBand = value.toLowerCase().replace(/[–—−]/g, "-").replace(/years?\s*old|years?|yrs?|岁|\s/g, "");
            const level = global.CURRICULUM_META?.levels?.find(entry => entry.ageBand === ageBand);
            if (!level || cell?.type === "d") issues.push(`Row ${rowNumber}: Starting age must be 2-3, 3-4, 4-5 or 5-6. Use the template's dropdown, or format the cell as Text first.`);
            else row.startUnit = level.firstUnitIndex;
          }
        } else {
          if (value.length > (field === "studentCode" ? 80 : 120)) issues.push(`Row ${rowNumber}: “${aliases[field][0]}” is too long. Check that this cell contains only a name or ID.`);
          row[field] = value;
        }
      }
      if (!row.englishName && !row.chineseName) { issues.push(`Row ${rowNumber}: enter an English name or Chinese name, or clear the whole row.`); continue; }
      const nameKey = JSON.stringify([row.englishName.toLocaleLowerCase("en"), row.chineseName.toLocaleLowerCase("en")]);
      const sameName = names.get(nameKey);
      if (sameName && (!sameName.studentCode || !row.studentCode)) issues.push(`Row ${rowNumber}: this child's name repeats row ${sameName.rowNumber}. If these are different children, give both a different Student ID.`);
      else if (!sameName) names.set(nameKey, { rowNumber, studentCode: row.studentCode });
      if (row.studentCode) {
        const code = row.studentCode.toLocaleLowerCase("en");
        if (ids.has(code)) issues.push(`Row ${rowNumber}: Student ID “${row.studentCode}” repeats row ${ids.get(code)}. Each child needs a different ID.`);
        else ids.set(code, rowNumber);
      }
      rows.push(row);
      if (rows.length > MAX_STUDENTS) fail("Import up to 500 children at a time. Split this list into smaller class files.");
    }
    if (issues.length) fail(`${issues.slice(0, 10).join("\n")}${issues.length > 10 ? `\nAnd ${issues.length - 10} more issues. Fix these rows and try again.` : ""}`);
    if (!rows.length) fail("No children's names were found. Fill in the blank rows on the Students worksheet, save, and import the file again.");
    return { rows, warnings };
  }

  async function read(file) {
    if (!file || typeof file.arrayBuffer !== "function") fail("Choose an Excel (.xlsx) or CSV UTF-8 (.csv) file.");
    if (file.size > MAX_BYTES) fail("The file is larger than 5 MB. Copy only the names into the blank template.");
    if (file.size === 0) fail("The file is empty. Choose the saved student-name file.");
    const extension = String(file.name || "").toLowerCase().split(".").pop();
    if (!["xlsx", "csv"].includes(extension)) fail("Choose Excel Workbook (.xlsx) or CSV UTF-8 (.csv). For an older .xls file, open it in Excel and save it as .xlsx first.");
    let bytes;
    try { bytes = new Uint8Array(await file.arrayBuffer()); }
    catch { fail("The file could not be opened. Save a copy on this computer and choose it again."); }
    if (bytes.byteLength > MAX_BYTES) fail("The file is larger than 5 MB. Copy only the names into the blank template.");
    if (extension === "xlsx") {
      const parsed = readXlsx(bytes);
      return validateRows(parsed.rows, parsed.warnings);
    }
    let csv;
    try {
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
      csv = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch { fail("The CSV text encoding could not be read. In Excel, save as CSV UTF-8 or Excel Workbook (.xlsx) and try again."); }
    return validateRows(parseCSV(csv), []);
  }

  global.RosterImport = Object.freeze({ read, maxStudents: MAX_STUDENTS, maxBytes: MAX_BYTES });
})(window);
