import Foundation
import Security
import Tauri

private func keychainService() -> String {
  let id = Bundle.main.bundleIdentifier ?? "com.standalone.calendar"
  return "\(id).secure-store"
}

private let refreshAccount = "refresh_token"

private struct TokenArgs: Decodable {
  let token: String
}

private struct TokenResult: Encodable {
  let token: String?
}

private enum Keychain {
  static func get(account: String) throws -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService(),
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
    return item as? Data
  }

  static func set(account: String, value: Data) throws {
    delete(account: account)
    let add: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService(),
      kSecAttrAccount as String: account,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      kSecValueData as String: value,
    ]
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
  }

  static func delete(account: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService(),
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
  }
}

class SecureStorePlugin: Plugin {
  @objc public func storeRefreshToken(_ invoke: Invoke) {
    do {
      let args = try invoke.parseArgs(TokenArgs.self)
      try Keychain.set(account: refreshAccount, value: Data(args.token.utf8))
      invoke.resolve()
    } catch {
      invoke.reject("Could not save the session.")
    }
  }

  @objc public func loadRefreshToken(_ invoke: Invoke) {
    do {
      let token = try Keychain.get(account: refreshAccount).flatMap {
        String(data: $0, encoding: .utf8)
      }
      invoke.resolve(TokenResult(token: token))
    } catch {
      invoke.reject("Could not read the session.")
    }
  }

  @objc public func clearSession(_ invoke: Invoke) {
    Keychain.delete(account: refreshAccount)
    invoke.resolve()
  }
}

@_cdecl("init_plugin_secure_store")
func initPlugin() -> Plugin {
  return SecureStorePlugin()
}
