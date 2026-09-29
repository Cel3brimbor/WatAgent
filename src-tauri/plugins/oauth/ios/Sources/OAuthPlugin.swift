import AuthenticationServices
import Tauri
import UIKit
import WebKit

private struct StartArgs: Decodable {
  let url: String
  let callbackScheme: String
}

class OAuthPlugin: Plugin, ASWebAuthenticationPresentationContextProviding {
  private weak var webview: WKWebView?
  private var session: ASWebAuthenticationSession?
  private var pending: Invoke?

  @objc public override func load(webview: WKWebView) {
    self.webview = webview
    #if DEBUG
    if #available(iOS 16.4, *) {
      webview.isInspectable = true
    }
    #endif
  }

  @objc public func start(_ invoke: Invoke) {
    let args: StartArgs
    do {
      args = try invoke.parseArgs(StartArgs.self)
    } catch {
      invoke.reject("Could not start sign-in.")
      return
    }
    guard let url = URL(string: args.url),
          let host = url.host?.lowercased(),
          url.scheme == "https",
          !host.isEmpty,
          host != "localhost",
          host != "127.0.0.1",
          !args.callbackScheme.isEmpty,
          args.callbackScheme.range(of: "^[A-Za-z][A-Za-z0-9+.-]*$", options: .regularExpression) != nil
    else {
      invoke.reject("Sign-in opened an unsupported address.")
      return
    }

    DispatchQueue.main.async { [weak self] in
      guard let self else {
        invoke.reject("Could not start sign-in.")
        return
      }
      self.failPending("Sign-in was cancelled.")
      self.pending = invoke

      let onComplete: ASWebAuthenticationSession.CompletionHandler = { [weak self] callbackURL, error in
        guard let self else { return }
        self.session = nil
        let invoke = self.pending
        self.pending = nil
        guard let invoke else { return }

        if let error = error as? ASWebAuthenticationSessionError,
           error.code == .canceledLogin {
          invoke.reject("Sign-in was cancelled.")
          return
        }
        if error != nil {
          invoke.reject("Sign-in failed.")
          return
        }
        guard let callbackURL,
              callbackURL.scheme?.lowercased() == args.callbackScheme.lowercased()
        else {
          invoke.reject("Sign-in did not return an auth code.")
          return
        }
        if let oauthError = Self.queryValue(callbackURL, name: "error"), !oauthError.isEmpty {
          invoke.reject("Sign-in was cancelled.")
          return
        }
        guard let code = Self.queryValue(callbackURL, name: "code"), !code.isEmpty else {
          invoke.reject("Sign-in did not return an auth code.")
          return
        }
        invoke.resolve(code)
      }

      let session: ASWebAuthenticationSession
      if #available(iOS 17.4, *) {
        session = ASWebAuthenticationSession(
          url: url,
          callback: .customScheme(args.callbackScheme),
          completionHandler: onComplete
        )
      } else {
        session = ASWebAuthenticationSession(
          url: url,
          callbackURLScheme: args.callbackScheme,
          completionHandler: onComplete
        )
      }
      session.presentationContextProvider = self
      session.prefersEphemeralWebBrowserSession = false
      self.session = session
      if !session.start() {
        self.session = nil
        self.pending = nil
        invoke.reject("Could not open the sign-in window.")
      }
    }
  }

  public func presentationAnchor(
    for session: ASWebAuthenticationSession
  ) -> ASPresentationAnchor {
    if let window = webview?.window {
      return window
    }
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
  }

  private func failPending(_ message: String) {
    session?.cancel()
    session = nil
    if let pending {
      pending.reject(message)
      self.pending = nil
    }
  }

  private static func queryValue(_ url: URL, name: String) -> String? {
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    if let value = components?.queryItems?.first(where: { $0.name == name })?.value,
       !value.isEmpty {
      return value
    }
    guard let fragment = components?.fragment, !fragment.isEmpty else { return nil }
    var parsed = URLComponents()
    parsed.percentEncodedQuery = fragment
    return parsed.queryItems?.first(where: { $0.name == name })?.value
  }
}

@_cdecl("init_plugin_oauth")
func initPlugin() -> Plugin {
  return OAuthPlugin()
}
