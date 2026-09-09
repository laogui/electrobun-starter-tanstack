import AppKit
import Darwin
import Foundation
import WebKit

struct HelperConfig: Decodable {
  var candidate: String
  var origin: String
  var fileUrl: String
  var wsUrl: String
  var html: String
  var hangHtml: String?
  var memoryHtml: String?
  var recoverHtml: String?
  var timeoutMs: Int?
  var hangMs: Int?
  var allocateBytes: Int?
  var blockNetwork: Bool?
  var mode: String?
  var resourceEntryJs: String?
  var resourceIndexHtml: String?
  var resourceModuleJs: String?
  var resourceStyleCss: String?
}

// The helper owns this tiny, fixed in-memory package. The page never receives
// a filesystem URL, directory listing, script message handler, or host bridge.
// Its only purpose is to verify that a future host-owned package resolver can
// load relative HTML/CSS/ESM resources while WebKit's URL rules remain active.
final class PluginResourceSchemeHandler: NSObject, WKURLSchemeHandler {
  private let resources: [String: String]

  init(resources: [String: String]) {
    self.resources = resources
  }

  func webView(_: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard let url = urlSchemeTask.request.url,
      url.host == "p0",
      !url.pathComponents.contains(".."),
      let content = resources[url.path]
    else {
      urlSchemeTask.didFailWithError(
        NSError(domain: "GhostBoardPluginResource", code: 404)
      )
      return
    }
    let mimeType: String
    if url.path.hasSuffix(".html") {
      mimeType = "text/html"
    } else if url.path.hasSuffix(".js") {
      mimeType = "text/javascript"
    } else if url.path.hasSuffix(".css") {
      mimeType = "text/css"
    } else {
      mimeType = "application/octet-stream"
    }
    let data = Data(content.utf8)
    let response = URLResponse(
      url: url,
      mimeType: mimeType,
      expectedContentLength: data.count,
      textEncodingName: "utf-8"
    )
    urlSchemeTask.didReceive(response)
    urlSchemeTask.didReceive(data)
    urlSchemeTask.didFinish()
  }

  func webView(_: WKWebView, stop _: WKURLSchemeTask) {}
}

final class Runtime {
  static let shared = Runtime()
  var delegate: AppDelegate?
}

@main
enum OsWebViewHelper {
  static func main() {
    let config: HelperConfig
    do {
      guard let data = try FileHandle.standardInput.readToEnd(), !data.isEmpty else {
        fputs("empty stdin config\n", stderr)
        exit(2)
      }
      config = try JSONDecoder().decode(HelperConfig.self, from: data)
    } catch {
      fputs("failed to read config: \(error)\n", stderr)
      exit(2)
    }

    let app = NSApplication.shared
    let delegate = AppDelegate(config: config)
    Runtime.shared.delegate = delegate
    app.delegate = delegate
    app.setActivationPolicy(.accessory)
    app.run()
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
  let config: HelperConfig
  let startedAt = Date()
  var window: NSWindow?
  var webView: WKWebView?
  var deniedNavigations: [String] = []
  var initialNavigationAllowed = false
  var finished = false
  var loadError: String?
  var contentRuleCompiled = false
  var ruleList: WKContentRuleList?
  var heartbeatTicks = 0
  var heartbeat: DispatchSourceTimer?
  var hangStarted = false
  var hangTerminatedByWatchdog = false
  var hangEvaluate: String = "not-run"
  var ticksAtHangStart = 0
  var ticksAfterHang = 0
  var destroyHangMs = -1
  var destroyMemoryMs = -1
  var recoverAfterHang: Any = NSNull()
  var recoverAfterMemory: Any = NSNull()
  var memoryPage: Any = NSNull()
  var uiRssKbBeforeMemory = -1
  var uiRssKbAfterMemory = -1
  var uiRssKbAfterDestroy = -1
  lazy var resourceSchemeHandler: PluginResourceSchemeHandler? = {
    guard mode == "resource",
      let index = config.resourceIndexHtml,
      let entry = config.resourceEntryJs,
      let module = config.resourceModuleJs,
      let style = config.resourceStyleCss
    else {
      return nil
    }
    return PluginResourceSchemeHandler(resources: [
      "/index.html": index,
      "/entry.js": entry,
      "/nested/resource-module.js": module,
      "/resource.css": style,
    ])
  }()

  var mode: String { config.mode ?? "probe" }

  init(config: HelperConfig) {
    self.config = config
    super.init()
  }

  func applicationDidFinishLaunching(_: Notification) {
    let window = NSWindow(
      contentRect: NSRect(x: 40, y: 40, width: 480, height: 320),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false
    )
    window.title = "GhostBoard OS WebView probe"
    window.isReleasedWhenClosed = false
    window.orderFront(nil)
    self.window = window

    startHeartbeat()
    let timeoutMs = config.timeoutMs ?? (mode == "probe" ? 10_000 : 25_000)
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) { [weak self] in
      self?.collect(reason: "timeout")
    }

    prepareRules { [weak self] in
      guard let self else { return }
      switch self.mode {
      case "hang":
        self.runHangUntilKilled()
      case "lifecycle":
        self.runLifecycle()
      case "resource":
        self.runResourceProbe()
      default:
        self.replaceWebView(html: self.config.html) { [weak self] in
          self?.pollProbe()
        }
      }
    }
  }

  func startHeartbeat() {
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now(), repeating: 0.2)
    timer.setEventHandler { [weak self] in
      guard let self, !self.finished else { return }
      self.heartbeatTicks += 1
      if self.mode == "hang", self.hangStarted {
        FileHandle.standardOutput.write(
          Data("OS_WEBVIEW_HELPER_HEARTBEAT \(self.heartbeatTicks)\n".utf8)
        )
        fflush(stdout)
      }
    }
    timer.resume()
    heartbeat = timer
  }

  func prepareRules(then: @escaping () -> Void) {
    guard config.blockNetwork == true else {
      then()
      return
    }
    // Keep the host-owned package scheme available for relative HTML/CSS/ESM
    // resources. A blanket `.*` rule also blocks that safe scheme, which
    // would force the host to serve package files over an ordinary network URL.
    // Block the probe's HTTP(S) and WS(S) URL canaries explicitly and leave
    // `ghostboard-plugin:` to the constrained in-memory scheme handler above.
    // The separate STUN canary intentionally verifies that this URL policy is
    // not mistaken for a complete network boundary.
    let rules = """
    [
      {"trigger":{"url-filter":"^https?://.*"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^wss?://.*"},"action":{"type":"block"}}
    ]
    """
    WKContentRuleListStore.default().compileContentRuleList(
      forIdentifier: "ghostboard-probe-block-all",
      encodedContentRuleList: rules
    ) { [weak self] list, error in
      DispatchQueue.main.async {
        if let error {
          self?.loadError = "content-rule compile failed: \(error)"
        }
        if let list {
          self?.ruleList = list
          self?.contentRuleCompiled = true
        }
        then()
      }
    }
  }

  func makeConfiguration() -> WKWebViewConfiguration {
    let userContent = WKUserContentController()
    if let ruleList {
      userContent.add(ruleList)
    }
    let configuration = WKWebViewConfiguration()
    configuration.userContentController = userContent
    configuration.websiteDataStore = .nonPersistent()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    if let resourceSchemeHandler {
      configuration.setURLSchemeHandler(
        resourceSchemeHandler,
        forURLScheme: "ghostboard-plugin"
      )
    }
    configuration.applicationNameForUserAgent = "GhostBoardOsWebViewHelper/0"
    configuration.mediaTypesRequiringUserActionForPlayback = .all
    if #available(macOS 12.3, *) {
      configuration.preferences.isElementFullscreenEnabled = false
    }
    return configuration
  }

  func replaceWebView(
    html: String,
    useResourceScheme: Bool = false,
    then: @escaping () -> Void
  ) {
    destroyWebView()
    initialNavigationAllowed = false
    deniedNavigations = []
    let webView = WKWebView(
      frame: NSRect(x: 0, y: 0, width: 480, height: 320),
      configuration: makeConfiguration()
    )
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsMagnification = false
    webView.allowsBackForwardNavigationGestures = false
    if #available(macOS 13.3, *) {
      webView.isInspectable = false
    }
    window?.contentView = webView
    self.webView = webView
    if useResourceScheme, let url = URL(string: "ghostboard-plugin://p0/index.html") {
      webView.load(URLRequest(url: url))
    } else {
      webView.loadHTMLString(html, baseURL: URL(string: "about:blank"))
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: then)
  }

  func runResourceProbe() {
    guard resourceSchemeHandler != nil else {
      loadError = "resource probe is missing package resources"
      collect(reason: "resource-config")
      return
    }
    replaceWebView(html: "", useResourceScheme: true) { [weak self] in
      self?.pollProbe()
    }
  }

  func destroyWebView() {
    webView?.stopLoading()
    webView?.navigationDelegate = nil
    webView?.uiDelegate = nil
    webView?.removeFromSuperview()
    webView = nil
    window?.contentView = nil
  }

  func isTruthy(_ result: Any?) -> Bool {
    if result as? Bool == true { return true }
    if let number = result as? NSNumber { return number.boolValue }
    if let number = result as? Int { return number != 0 }
    if let number = result as? Double { return number != 0 }
    if let text = result as? String { return text == "true" || text == "1" }
    return false
  }

  func startPageHang() {
    // Fire-and-forget: this callback is not expected to return while JS is hung.
    webView?.evaluateJavaScript("for (;;) {}") { _, _ in }
  }

  func runHangUntilKilled() {
    let html = config.hangHtml ?? config.html
    replaceWebView(html: html) { [weak self] in
      self?.waitForJS("window.__STARTED__ === true", timeoutMs: 4000) { started in
        guard let self else { return }
        self.hangStarted = started
        self.ticksAtHangStart = self.heartbeatTicks
        if started {
          self.startPageHang()
        }
        let marker = [
          "pid": Int(ProcessInfo.processInfo.processIdentifier),
          "parentPid": Int(getppid()),
          "started": started,
        ] as [String: Any]
        if let data = try? JSONSerialization.data(withJSONObject: marker),
          let text = String(data: data, encoding: .utf8)
        {
          FileHandle.standardOutput.write(Data("OS_WEBVIEW_HELPER_STARTED \(text)\n".utf8))
          fflush(stdout)
        }
      }
    }
  }

  func runLifecycle() {
    let hangHtml = config.hangHtml ?? config.html
    replaceWebView(html: hangHtml) { [weak self] in
      self?.waitForJS("window.__STARTED__ === true", timeoutMs: 4000) { started in
        guard let self else { return }
        self.hangStarted = started
        self.ticksAtHangStart = self.heartbeatTicks
        if started {
          self.startPageHang()
        }
        let hangMs = self.config.hangMs ?? 1500
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(hangMs)) {
          self.evaluateWithTimeout("1+1", timeoutMs: 500) { result in
            if let number = result as? Int {
              self.hangEvaluate = "returned:\(number)"
            } else if let number = result as? Double {
              self.hangEvaluate = "returned:\(Int(number))"
            } else if result != nil {
              self.hangEvaluate = "returned"
            } else {
              self.hangEvaluate = self.hangTerminatedByWatchdog ? "terminated" : "timeout"
            }
            self.ticksAfterHang = self.heartbeatTicks
            let destroyStarted = Date()
            self.destroyWebView()
            self.destroyHangMs = Int(Date().timeIntervalSince(destroyStarted) * 1000)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
              self.replaceWebView(html: self.config.html) {
                self.waitForJSON("window.__PROBE_RESULT_JSON__", timeoutMs: 8000) { json in
                  self.recoverAfterHang = json ?? NSNull()
                  self.runMemoryPhase()
                }
              }
            }
          }
        }
      }
    }
  }

  func runMemoryPhase() {
    uiRssKbBeforeMemory = uiRssKb()
    let html = config.memoryHtml ?? config.html
    replaceWebView(html: html) { [weak self] in
      self?.waitForJSON("window.__MEMORY_DONE__", timeoutMs: 8000) { json in
        guard let self else { return }
        self.memoryPage = json ?? NSNull()
        self.uiRssKbAfterMemory = self.uiRssKb()
        let destroyStarted = Date()
        self.destroyWebView()
        self.destroyMemoryMs = Int(Date().timeIntervalSince(destroyStarted) * 1000)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
          self.uiRssKbAfterDestroy = self.uiRssKb()
          self.replaceWebView(html: self.config.recoverHtml ?? self.config.html) {
            self.waitForJSON("window.__PROBE_RESULT_JSON__", timeoutMs: 8000) { json in
              self.recoverAfterMemory = json ?? NSNull()
              self.collect(reason: "lifecycle")
            }
          }
        }
      }
    }
  }

  func pollProbe() {
    waitForJSON("window.__PROBE_RESULT_JSON__", timeoutMs: config.timeoutMs ?? 10_000) { json in
      var pageJSON: String?
      if let json,
        let data = try? JSONSerialization.data(withJSONObject: json),
        let text = String(data: data, encoding: .utf8)
      {
        pageJSON = text
      }
      self.collect(reason: json == nil ? "timeout" : "page", pageJSON: pageJSON)
    }
  }

  func waitForJS(_ expression: String, timeoutMs: Int, completion: @escaping (Bool) -> Void) {
    let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
    func poll() {
      guard !finished, let webView else {
        completion(false)
        return
      }
      webView.evaluateJavaScript(expression) { result, _ in
        DispatchQueue.main.async {
          if self.isTruthy(result) {
            completion(true)
            return
          }
          if Date() >= deadline {
            completion(false)
            return
          }
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: poll)
        }
      }
    }
    poll()
  }

  func waitForJSON(_ expression: String, timeoutMs: Int, completion: @escaping (Any?) -> Void) {
    let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
    func poll() {
      guard !finished, let webView else {
        completion(nil)
        return
      }
      webView.evaluateJavaScript(expression) { result, _ in
        DispatchQueue.main.async {
          if let json = result as? String, !json.isEmpty,
            let data = json.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data)
          {
            if expression.contains("PROBE_RESULT") {
              if let dict = object as? [String: Any], dict["network"] != nil {
                completion(object)
                return
              }
            } else {
              completion(object)
              return
            }
          }
          if Date() >= deadline {
            completion(nil)
            return
          }
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: poll)
        }
      }
    }
    poll()
  }

  func evaluateWithTimeout(_ js: String, timeoutMs: Int, completion: @escaping (Any?) -> Void) {
    var done = false
    webView?.evaluateJavaScript(js) { result, _ in
      DispatchQueue.main.async {
        guard !done else { return }
        done = true
        completion(result)
      }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) {
      guard !done else { return }
      done = true
      completion(nil)
    }
  }

  func uiRssKb() -> Int {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(
      MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size
    )
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { intPointer in
        task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), intPointer, &count)
      }
    }
    guard result == KERN_SUCCESS else { return -1 }
    return Int(info.resident_size / 1024)
  }

  func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {}

  func webView(_ webView: WKWebView, didFail _: WKNavigation!, withError error: Error) {
    loadError = String(describing: error)
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation _: WKNavigation!,
    withError error: Error
  ) {
    loadError = String(describing: error)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    hangTerminatedByWatchdog = true
    if mode == "probe" || mode == "resource" {
      loadError = "webContent process terminated"
      collect(reason: "terminated")
    }
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    if !initialNavigationAllowed {
      initialNavigationAllowed = true
      decisionHandler(.allow)
      return
    }
    deniedNavigations.append(navigationAction.request.url?.absoluteString ?? "unknown")
    decisionHandler(.cancel)
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    deniedNavigations.append(navigationAction.request.url?.absoluteString ?? "popup")
    return nil
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }

  func collect(reason: String, pageJSON: String? = nil) {
    guard !finished else { return }
    finished = true
    heartbeat?.cancel()

    var pageResult: Any = NSNull()
    if let pageJSON, let data = pageJSON.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data)
    {
      pageResult = object
    }

    let environment = ProcessInfo.processInfo.environment
    var payload: [String: Any] = [
      "candidate": config.candidate,
      "mode": mode,
      "pid": Int(ProcessInfo.processInfo.processIdentifier),
      "parentPid": Int(getppid()),
      "reason": reason,
      "registeredMessageHandlers": [] as [String],
      "deniedNavigations": deniedNavigations,
      "pageResult": pageResult,
      "loadError": loadError as Any? ?? NSNull(),
      "contentRuleCompiled": contentRuleCompiled,
      "home": NSHomeDirectory(),
      "tmp": FileManager.default.temporaryDirectory.path,
      "sandboxContainerId": environment["APP_SANDBOX_CONTAINER_ID"] as Any? ?? NSNull(),
      "macos": ProcessInfo.processInfo.operatingSystemVersionString,
      "heartbeatTicks": heartbeatTicks,
    ]
    if mode == "lifecycle" {
      payload["hang"] = [
        "started": hangStarted,
        "ticksAtStart": ticksAtHangStart,
        "ticksAfterHang": ticksAfterHang,
        "evaluateDuringHang": hangEvaluate,
        "webContentTerminated": hangTerminatedByWatchdog,
        "destroyMs": destroyHangMs,
      ]
      payload["recoverAfterHang"] = recoverAfterHang
      payload["memory"] = [
        "requestedBytes": config.allocateBytes ?? 0,
        "page": memoryPage,
        "uiRssKbBefore": uiRssKbBeforeMemory,
        "uiRssKbAfter": uiRssKbAfterMemory,
        "uiRssKbAfterDestroy": uiRssKbAfterDestroy,
        "destroyMs": destroyMemoryMs,
      ]
      payload["recoverAfterMemory"] = recoverAfterMemory
    }

    do {
      let data = try JSONSerialization.data(withJSONObject: payload, options: [])
      guard let text = String(data: data, encoding: .utf8) else {
        fputs("failed to encode result as utf-8\n", stderr)
        exit(3)
      }
      FileHandle.standardOutput.write(Data("OS_WEBVIEW_HELPER_RESULT \(text)\n".utf8))
      fflush(stdout)
      let tmp = FileManager.default.temporaryDirectory
        .appendingPathComponent("os-webview-helper-result.json")
      try? data.write(to: tmp)
    } catch {
      fputs("failed to write result: \(error)\n", stderr)
      exit(3)
    }

    NSApp.terminate(nil)
    exit(0)
  }
}
