import AppKit
import Foundation
import WebKit

// Runs only the supplied public web assets and synthetic JSON in an ephemeral
// WebKit store. No production app bridge or Application Support path is opened.
@main
final class WebPerformanceTests: NSObject, WKNavigationDelegate {
    var webView: WKWebView!
    static var runner: WebPerformanceTests!

    static func main() {
        guard CommandLine.arguments.count == 3 else {
            print("Usage: web-performance-tests WEB_DIRECTORY SYNTHETIC_JSON")
            exit(2)
        }
        let application = NSApplication.shared
        application.setActivationPolicy(.prohibited)
        runner = WebPerformanceTests()
        do { try runner.start() } catch { print("FAIL \(error)"); exit(1) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 45) { print("FAIL WebKit test timed out"); exit(1) }
        application.run()
    }

    func start() throws {
        let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let fixture = try String(contentsOfFile: CommandLine.arguments[2], encoding: .utf8)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.addUserScript(WKUserScript(source: """
          const NativeDate=Date;
          window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-09-20T04:00:00.000Z']));}static now(){return new NativeDate('2026-09-20T04:00:00.000Z').getTime();}};
          localStorage.setItem('seahorse-english-tracker-v1',JSON.stringify(\(fixture)));
          """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1240, height: 820), configuration: configuration)
        webView.navigationDelegate = self
        webView.loadFileURL(directory.appendingPathComponent("index.html"), allowingReadAccessTo: directory)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let script = """
        (()=>{
          const check=(condition,message)=>{if(!condition)throw new Error(message);};
          const saved=()=>JSON.parse(localStorage.getItem('seahorse-english-tracker-v1'));
          const before=saved(),results=[];
          const click=(label,selector)=>{
            const button=document.querySelector(selector);check(button&&!button.disabled,'Missing enabled '+label);
            const start=performance.now();button.click();results.push({label,milliseconds:performance.now()-start});
          };
          click('switch child','#studentList [data-student-id="child-1"]');
          check(saved().selectedStudentId==='child-1','Wrong child selected');
          check(JSON.stringify(saved().records)===JSON.stringify(before.records),'Child switch changed practice history');
          click('Knows it','[data-item-index="1"][data-state="known"]');
          check(saved().records['child-1::2026-09-14'].itemStates[1]==='known','Knowledge mark did not save');
          check(!saved().records['child-1::2026-09-14'].practiceFinished,'Mark silently finished practice');
          click('Needs practice','[data-item-index="1"][data-state="learning"]');
          check(saved().records['child-1::2026-09-14'].itemStates[1]==='learning','Practice mark did not save');
          click('next week','#nextWeekButton');check(saved().selectedWeekStart==='2026-09-21','Wrong next week');
          click('last unlocked week','#nextWeekButton');check(saved().selectedWeekStart==='2026-09-28','Wrong boundary week');
          click('locked next month','#nextWeekButton');
          check(saved().selectedWeekStart==='2026-09-28'&&document.querySelector('#examRequiredDialog').open,'Exam lock bypassed');
          check(JSON.stringify(saved().monthlyExams)===JSON.stringify(before.monthlyExams),'Exam history changed');
          check(results.every(result=>result.milliseconds<350),'WebKit action exceeded 350ms: '+JSON.stringify(results));
          return JSON.stringify(results);
        })()
        """
        webView.evaluateJavaScript(script) { result, error in
            if let error = error { print("FAIL WebKit: \(error)"); exit(1) }
            print("PASS native WebKit saved-history actions, marks and exam gating: \(result ?? "no result")")
            exit(0)
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("FAIL WebKit navigation: \(error)"); exit(1)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("FAIL WebKit provisional navigation: \(error)"); exit(1)
    }
}
