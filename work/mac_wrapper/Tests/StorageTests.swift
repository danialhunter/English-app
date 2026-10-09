import Foundation

@main
enum StorageTests {
    static func main() throws {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory.appendingPathComponent("seahorse-storage-test-\(UUID().uuidString)")
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: directory) }
        func state(_ lesson: Int) -> Data {
            Data("{\"schemaVersion\":1,\"students\":[{\"id\":\"sample-child\"}],\"records\":{\"week\":{\"lesson\":\(lesson)}}}".utf8)
        }
        func check(_ condition: Bool, _ message: String) throws {
            if !condition { throw NSError(domain: "StorageTests", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
        }
        let first = TrackerStorage(directory: directory, version: "2.0.0")
        try state(1).write(to: first.file)
        let initial = first.load()
        try check(initial["ok"] as? Bool == true, "Existing data must load")
        let originalBackup = URL(fileURLWithPath: initial["backupPath"] as! String)
        try check(Data(contentsOf: originalBackup) == state(1), "Pre-upgrade copy must match original bytes")
        try first.save(state(2))
        let reinstalled = TrackerStorage(directory: directory, version: "2.0.0")
        try check(reinstalled.load()["base64"] as? String == state(2).base64EncodedString(), "Reinstall must reopen newest progress")
        try check(Data(contentsOf: originalBackup) == state(1), "Pre-upgrade backup must remain immutable")
        do {
            try reinstalled.save(Data("{}".utf8))
            throw NSError(domain: "StorageTests", code: 2)
        } catch {
            try check(Data(contentsOf: first.file) == state(2), "Invalid save must not change existing records")
        }
        try Data("broken{".utf8).write(to: first.file)
        let recovered = TrackerStorage(directory: directory, version: "2.0.0")
        try check(recovered.load()["recovered"] as? Bool == true, "Corrupt state must recover from backup")
        try recovered.save(state(3))
        let unreadable = try fileManager.contentsOfDirectory(at: first.backups, includingPropertiesForKeys: nil).first { $0.lastPathComponent.hasPrefix("unreadable-") }!
        try check(Data(contentsOf: unreadable) == Data("broken{".utf8), "Unreadable primary must be preserved")
        let blockedDirectory = directory.appendingPathComponent("blocked")
        try fileManager.createDirectory(at: blockedDirectory, withIntermediateDirectories: true)
        let blocked = TrackerStorage(directory: blockedDirectory, version: "2.0.0")
        try Data("broken{".utf8).write(to: blocked.file)
        try check(blocked.load()["ok"] as? Bool == false, "Unrecoverable state must block loading")
        do {
            try blocked.save(state(4))
            throw NSError(domain: "StorageTests", code: 3)
        } catch {
            try check(Data(contentsOf: blocked.file) == Data("broken{".utf8), "Blocked save must keep original")
        }
        try blocked.save(state(5), restoring: true)
        try check(Data(contentsOf: blocked.file) == state(5), "Explicit restore should safely recover from blocked loading")
        let deletionDirectory = directory.appendingPathComponent("synthetic-deletion")
        let deletionStore = TrackerStorage(directory: deletionDirectory, version: "2.1.1")
        try check(deletionStore.load()["found"] as? Bool == false, "Deletion test must start in an isolated empty directory")
        let records: [String: Any] = ["week": ["lesson": "saved lesson", "notes": "Keep the teacher note", "additionalPractice": [["entryId": "synthetic-extra", "state": "known"]]]]
        let deleted: [String: Any] = ["schemaVersion": 3, "students": [["id": "synthetic-child", "active": false, "deletedAt": "2026-09-14T00:00:00Z"]], "records": records]
        let deletedData = try JSONSerialization.data(withJSONObject: deleted, options: [.sortedKeys])
        try deletionStore.save(deletedData)
        let deletionRestart = TrackerStorage(directory: deletionDirectory, version: "2.1.1")
        try check(deletionRestart.load()["base64"] as? String == deletedData.base64EncodedString(), "Deleted child recovery details must survive restart")
        let restored: [String: Any] = ["schemaVersion": 3, "students": [["id": "synthetic-child", "active": true]], "records": records]
        let restoredData = try JSONSerialization.data(withJSONObject: restored, options: [.sortedKeys])
        try deletionRestart.save(restoredData)
        let restoredObject = try JSONSerialization.jsonObject(with: Data(contentsOf: deletionStore.file)) as! [String: Any]
        try check(NSDictionary(dictionary: restoredObject["records"] as! [String: Any]).isEqual(to: records), "Restoration must keep saved notes and extra practice")
        let restoredRestart = TrackerStorage(directory: deletionDirectory, version: "2.1.1")
        try check(restoredRestart.load()["base64"] as? String == restoredData.base64EncodedString(), "Restored child must survive a second restart")
        let examDirectory = directory.appendingPathComponent("synthetic-exams")
        let examStore = TrackerStorage(directory: examDirectory, version: "2.2.0")
        try fileManager.createDirectory(at: examDirectory, withIntermediateDirectories: true)
        let examRound: [String: Any] = ["id":"synthetic-round-1","month":"2026-09","attempts":[["date":"2026-09-30","marks":["known","learning"],"notes":"Keep exam notes"]],"passed":false]
        let examState: [String: Any] = ["schemaVersion":4,"students":[["id":"synthetic-child"]],"records":records,"examRounds":["sample":[examRound]]]
        let originalExamData = try JSONSerialization.data(withJSONObject:examState,options:[.sortedKeys])
        try originalExamData.write(to:examStore.file)
        let examLoad = examStore.load()
        var updatedExamState = examState
        var updatedExamRound = examRound
        updatedExamRound["passed"] = true
        updatedExamRound["attempts"] = [["date":"2026-09-30","marks":["known","learning"],"notes":"Keep exam notes"],["date":"2026-10-02","marks":["known","known"],"notes":"Retest"]]
        updatedExamState["examRounds"] = ["sample":[updatedExamRound]]
        let updatedExamData = try JSONSerialization.data(withJSONObject:updatedExamState,options:[.sortedKeys])
        try examStore.save(updatedExamData)
        let examRestart = TrackerStorage(directory:examDirectory,version:"2.2.0")
        try check(examRestart.load()["base64"] as? String == updatedExamData.base64EncodedString(),"Schema 4 exam rounds must survive restart")
        try check(Data(contentsOf:URL(fileURLWithPath:examLoad["backupPath"] as! String)) == originalExamData,"Original exam snapshot must remain immutable")
        try examRestart.save(originalExamData,restoring:true)
        let beforeExamRestore = try fileManager.contentsOfDirectory(at:examStore.backups,includingPropertiesForKeys:nil).first { $0.lastPathComponent.hasPrefix("before-restore-") }!
        try check(Data(contentsOf:beforeExamRestore) == updatedExamData,"Restore must preserve the outgoing exam rounds")
        try check(Data(contentsOf:examStore.file) == originalExamData,"Explicit restore must retain original schema 4 exam fields")
        let sampledDirectory = directory.appendingPathComponent("synthetic-sampled-exams")
        let sampledStore = TrackerStorage(directory:sampledDirectory,version:"2.3.1")
        try fileManager.createDirectory(at:sampledDirectory,withIntermediateDirectories:true)
        let sampledDraft: [String: Any] = ["itemIndexes":[0,2],"itemStates":["known","unassessed","learning"],"notes":"Synthetic selected sample"]
        let sampledState: [String: Any] = ["schemaVersion":5,"students":[["id":"synthetic-child"]],"records":records,"monthlyExams":["rounds":["synthetic-round":["attempts":["synthetic-child":["draft":sampledDraft,"history":[]]]]]]]
        let sampledData = try JSONSerialization.data(withJSONObject:sampledState,options:[.sortedKeys])
        try sampledData.write(to:sampledStore.file)
        let sampledLoad = sampledStore.load()
        var sampledCompletedState = sampledState
        var completedSample = sampledDraft
        completedSample["completedAt"] = "2026-09-14T04:00:00Z"
        sampledCompletedState["monthlyExams"] = ["rounds":["synthetic-round":["attempts":["synthetic-child":["draft":NSNull(),"history":[completedSample]]]]]]
        let sampledCompletedData = try JSONSerialization.data(withJSONObject:sampledCompletedState,options:[.sortedKeys])
        try sampledStore.save(sampledCompletedData)
        let sampledRestart = TrackerStorage(directory:sampledDirectory,version:"2.3.1")
        try check(sampledRestart.load()["base64"] as? String == sampledCompletedData.base64EncodedString(),"Sample indices and unselected marks must survive restart unchanged")
        try check(Data(contentsOf:URL(fileURLWithPath:sampledLoad["backupPath"] as! String)) == sampledData,"Pre-upgrade copy retains the original sample")
        try sampledRestart.save(sampledData,restoring:true)
        try check(Data(contentsOf:sampledStore.file) == sampledData,"Sampled draft must restore without losing unselected marks")
        let policyDirectory = directory.appendingPathComponent("synthetic-schema6-policy")
        try fileManager.createDirectory(at:policyDirectory,withIntermediateDirectories:true)
        let policyStore = TrackerStorage(directory:policyDirectory,version:"2.4.0")
        try sampledCompletedData.write(to:policyStore.file)
        let policyLoad = policyStore.load()
        var policyState = sampledCompletedState
        policyState["schemaVersion"] = 6
        policyState["appVersion"] = "2.4.0"
        var legacyCompletedSample = completedSample
        legacyCompletedSample["scoringRule"] = "legacy-sampled-v1"
        legacyCompletedSample["passPercent"] = 80
        var policyDraft = sampledDraft
        policyDraft["scoringRule"] = "overall-majority-v1"
        policyDraft["passPercent"] = 80
        policyDraft["startedAt"] = "2026-09-20T01:00:00Z"
        let policyRound: [String: Any] = [
            "attempts":["synthetic-child":["draft":policyDraft,"history":[legacyCompletedSample]]],
            "absences":["synthetic-absent":["absent":true,"updatedAt":"2026-09-20T02:00:00Z"]],
            "unlock":["at":"2026-09-20T02:10:00Z","cohortIds":["synthetic-child","synthetic-absent"],"countedIds":["synthetic-child"],"absentIds":["synthetic-absent"],"completedIds":["synthetic-child"],"passedIds":["synthetic-child"]],
            "cohort":[["studentId":"synthetic-child","countsForClass":true],["studentId":"synthetic-newcomer","countsForClass":false]]
        ]
        policyState["monthlyExams"] = ["rounds":["synthetic-round":policyRound]]
        policyState["students"] = [["id":"synthetic-child"],["id":"synthetic-newcomer","joinedAt":"2026-09-20T03:00:00Z"]]
        var preparationRecords = records
        preparationRecords["preparation"] = ["examPreparation":["periodStart":"2026-09-01","weekStart":"2026-09-28","unitIndex":50]]
        policyState["records"] = preparationRecords
        let policyData = try JSONSerialization.data(withJSONObject:policyState,options:[.sortedKeys])
        try policyStore.save(policyData)
        let policyReinstall = TrackerStorage(directory:policyDirectory,version:"2.4.0")
        try check(policyReinstall.load()["base64"] as? String == policyData.base64EncodedString(),"Schema 6 scoring provenance and retained evidence must survive reinstall byte-for-byte")
        try check(Data(contentsOf:URL(fileURLWithPath:policyLoad["backupPath"] as! String)) == sampledCompletedData,"Schema 5 pre-upgrade copy must remain immutable across reinstall")
        try policyReinstall.save(sampledCompletedData,restoring:true)
        let beforePolicyRestore = try fileManager.contentsOfDirectory(at:policyStore.backups,includingPropertiesForKeys:nil).first { $0.lastPathComponent.hasPrefix("before-restore-") }!
        try check(Data(contentsOf:beforePolicyRestore) == policyData,"Explicit restore must retain outgoing schema 6 scoring and draft fields")
        try check(Data(contentsOf:policyStore.file) == sampledCompletedData,"Previous backups remain restorable without losing completed history")
        let simplifiedDirectory = directory.appendingPathComponent("synthetic-schema7-workflow")
        try fileManager.createDirectory(at:simplifiedDirectory,withIntermediateDirectories:true)
        let simplifiedStore = TrackerStorage(directory:simplifiedDirectory,version:"2.5.0")
        try policyData.write(to:simplifiedStore.file)
        let simplifiedLoad = simplifiedStore.load()
        let simplifiedBackup = URL(fileURLWithPath:simplifiedLoad["backupPath"] as! String)
        try check(simplifiedBackup.lastPathComponent == "before-version-2.5.0.json","Upgrade must use the version-specific safety backup")
        var simplifiedState = policyState
        simplifiedState["schemaVersion"] = 7
        simplifiedState["appVersion"] = "2.5.0"
        let reviewTargetId = "[0,0,\"book\"]"
        let reviewTarget: [String:Any] = ["id":reviewTargetId,"text":"book","kind":"vocabulary","expectation":"Point to or name it independently","sourceWeekStart":"2026-09-07","sourceUnitIndex":0,"sourceItemIndex":0,"sourceDate":"2026-09-07","sourceMark":"known","dueDate":"2026-10-16","lastMark":"learning","checks":[["date":"2026-10-09","mark":"learning"]],"postponements":[]]
        let futureGoal: [String:Any] = ["id":"synthetic-goal","studentId":"synthetic-child","week":"2026-10-12","unitIndex":5,"targetIndex":0,"expectation":"Name it independently","previous":"Point to or name it independently","at":"2026-10-09T01:00:00Z"]
        simplifiedState["learningReview"] = ["settings":["firstDays":7,"repeatDays":28,"limit":3],"children":["synthetic-child":["targets":[reviewTargetId:reviewTarget]]],"goals":[futureGoal]]
        var correctedAttempt = legacyCompletedSample
        correctedAttempt["id"] = "synthetic-attempt"
        let correction = ["id":"synthetic-correction","attemptId":"synthetic-attempt","at":"2026-10-09T02:00:00Z","reason":"Wrong child selected for the original marks"]
        simplifiedState["monthlyExams"] = ["rounds":["synthetic-round":["attempts":["synthetic-child":["draft":policyDraft,"history":[correctedAttempt],"corrections":[correction]]]]]]
        let simplifiedData = try JSONSerialization.data(withJSONObject:simplifiedState,options:[.sortedKeys])
        try simplifiedStore.save(simplifiedData)
        let simplifiedRestart = TrackerStorage(directory:simplifiedDirectory,version:"2.5.0")
        try check(simplifiedRestart.load()["base64"] as? String == simplifiedData.base64EncodedString(),"Schema 7 reviews, goals, corrections and saved draft answers must survive reinstall unchanged")
        try check(Data(contentsOf:simplifiedBackup) == policyData,"Reinstall must not overwrite the original pre-2.5.0 state")
        try simplifiedRestart.save(policyData,restoring:true)
        let beforeSimplifiedRestore = try fileManager.contentsOfDirectory(at:simplifiedStore.backups,includingPropertiesForKeys:nil).first { $0.lastPathComponent.hasPrefix("before-restore-") }!
        try check(Data(contentsOf:beforeSimplifiedRestore) == simplifiedData,"Restore must preserve outgoing schema 7 audit fields")
        try check(Data(contentsOf:simplifiedStore.file) == policyData,"Older full backups remain restorable")
        let freshInstall = TrackerStorage(directory:directory.appendingPathComponent("fresh-2.5.0"),version:"2.5.0")
        try check(freshInstall.load()["found"] as? Bool == false,"A separate new installation must have no inherited teacher records")
        print("Mac storage checks passed: upgrade, reinstall, immutable snapshots, invalid/recovered/blocked saves, restore, deletion, exam evidence and schema 7 review/goal/correction preservation.")
    }
}
