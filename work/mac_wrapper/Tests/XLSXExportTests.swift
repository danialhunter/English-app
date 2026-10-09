import Foundation

@main
enum XLSXExportTests {
    static func main() throws {
        let workbook = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let valid: [String: Any] = ["filename":"EtonHouse 2-month report.xlsx", "base64":workbook.base64EncodedString(), "mimeType":XLSXExport.mimeType]
        func check(_ condition: Bool, _ message: String) throws {
            if !condition { throw NSError(domain:"XLSXExportTests",code:1,userInfo:[NSLocalizedDescriptionKey:message]) }
        }
        let parsed = try XLSXExport(payload:valid)
        try check(parsed.data == workbook, "Workbook bytes must be preserved")
        try check(parsed.filename == "EtonHouse 2-month report.xlsx", "Report filename must be preserved")
        var alias = valid
        alias.removeValue(forKey:"mimeType"); alias["mime"] = XLSXExport.mimeType
        try check(try XLSXExport(payload:alias).data == workbook, "Legacy MIME alias must remain supported")
        for filename in ["../report.xlsx","folder/report.xlsx","C:\\report.xlsx","report.xlsx.exe","CON.xlsx","aux.xlsx","LPT1.xlsx",".hidden.xlsx"," report.xlsx","report.xlsx ","report?.xlsx","report\u{0000}.xlsx",String(repeating:"a",count:240)+".xlsx"] {
            var payload = valid; payload["filename"] = filename
            do { _ = try XLSXExport(payload:payload); throw NSError(domain:"XLSXExportTests",code:2) }
            catch is XLSXExportError { }
        }
        for base64 in ["","not base64","UEsDBA","UEsDBB==","UEsDBA==\n","UEsDBA==garbage",Data("not an xlsx".utf8).base64EncodedString(),String(repeating:"A",count:XLSXExport.maximumBase64Length+4)] {
            var payload = valid; payload["base64"] = base64
            do { _ = try XLSXExport(payload:payload); throw NSError(domain:"XLSXExportTests",code:3) }
            catch is XLSXExportError { }
        }
        var wrongMime = valid; wrongMime["mimeType"] = "application/octet-stream"
        do { _ = try XLSXExport(payload:wrongMime); throw NSError(domain:"XLSXExportTests",code:4) }
        catch is XLSXExportError { }
        // Boundary payload deliberately tests opaque transport, not workbook layout.
        var boundary = Data(repeating:0x61,count:XLSXExport.maximumBytes)
        boundary.replaceSubrange(0..<4,with:[0x50,0x4b,0x03,0x04])
        var boundaryPayload = valid; boundaryPayload["base64"] = boundary.base64EncodedString()
        try check(try XLSXExport(payload:boundaryPayload).data == boundary,"Exactly 20 MB must round-trip without truncation")
        boundary.append(0x62)
        let tooLarge = boundary.base64EncodedString()
        try check(tooLarge.utf8.count == XLSXExport.maximumBase64Length,"Decoded-size guard must catch equal encoded lengths")
        boundaryPayload["base64"] = tooLarge
        do { _ = try XLSXExport(payload:boundaryPayload); throw NSError(domain:"XLSXExportTests",code:5) }
        catch is XLSXExportError { }
        print("Mac XLSX export checks passed: workbook bytes, MIME compatibility, safe filenames, strict base64, ZIP signature and exact 20 MB boundary protection.")
    }
}
