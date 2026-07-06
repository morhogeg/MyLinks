import Foundation
import Security

/// Tiny Keychain wrapper for secrets shared between the main app and the
/// Share Extension (security finding H3: the ingest token used to live in the
/// App Group's UserDefaults, i.e. a plaintext plist inside the shared
/// container — device backups and anything with container access could read
/// it). Both processes now read/write a `kSecClassGenericPassword` item in a
/// shared *keychain access group* instead.
///
/// Compiled into BOTH targets (App and ShareExt — see project.pbxproj), so the
/// query attributes are guaranteed identical on both sides.
enum KeychainHelper {

    /// Keychain access group shared by the app and the extension.
    ///
    /// In BOTH entitlements files this group is spelled
    /// `$(AppIdentifierPrefix)com.morhogeg.machina.shared` — codesign expands
    /// the variable at signing time. At *runtime*, however, the Security
    /// framework wants the literal team-prefixed string, so the team ID is
    /// hardcoded here. `8Y2M94RUHG` is this project's DEVELOPMENT_TEAM (see
    /// App.xcodeproj/project.pbxproj); if the app ever moves to a different
    /// team, update this constant and nothing else.
    static let accessGroup = "8Y2M94RUHG.com.morhogeg.machina.shared"

    /// Service namespace for our items.
    static let service = "com.morhogeg.machina"

    /// Base query identifying one item by service + account within the shared
    /// access group.
    private static func baseQuery(account: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }

    /// Read a UTF-8 string value. Returns nil when the item doesn't exist
    /// (errSecItemNotFound) or on any other error — callers treat "no token"
    /// uniformly.
    static func get(account: String) -> String? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = kCFBooleanTrue as Any
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8),
              !value.isEmpty else {
            return nil
        }
        return value
    }

    /// Write (create or replace) a UTF-8 string value. Returns true on
    /// success. Tries SecItemAdd first; on errSecDuplicateItem falls back to
    /// SecItemUpdate so existing item attributes are preserved.
    @discardableResult
    static func set(_ value: String, account: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }

        var addQuery = baseQuery(account: account)
        addQuery[kSecValueData as String] = data
        // AfterFirstUnlockThisDeviceOnly: readable by the (background-capable)
        // extension after the first unlock, never migrates via backup/restore
        // to another device.
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        if addStatus == errSecSuccess { return true }
        guard addStatus == errSecDuplicateItem else { return false }

        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(baseQuery(account: account) as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return true }

        // Last resort (e.g. the existing item was created with incompatible
        // attributes): delete and re-add.
        SecItemDelete(baseQuery(account: account) as CFDictionary)
        return SecItemAdd(addQuery as CFDictionary, nil) == errSecSuccess
    }

    /// Delete the item. Missing items (errSecItemNotFound) count as success.
    @discardableResult
    static func delete(account: String) -> Bool {
        let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
