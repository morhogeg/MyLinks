import Foundation
import Security

/// The share-ingest token's home on device: a generic-password Keychain item
/// shared between the app and the Share Extension.
///
/// Why not the App Group's UserDefaults (where it lived until 2026-09-16): that
/// plist is part of device backups and readable by anything with container
/// access, and the token is a long-lived credential for the account's whole
/// library. The Keychain item is `AfterFirstUnlockThisDeviceOnly`: it never
/// leaves the device (not in backups, not migrated to a new phone) and is
/// readable once the device has been unlocked once since boot, which is
/// exactly when a share sheet can run.
///
/// Sharing across the two targets: on iOS the keychain access groups an app
/// may use are its own app ID, its `keychain-access-groups`, AND its
/// `com.apple.security.application-groups`. Both targets already carry the
/// App Group `group.com.morhogeg.machina`, so it doubles as the keychain
/// group with no new entitlement, no App ID capability change, and no
/// provisioning-profile change (Apple documents the App Group as a valid
/// keychain access group on iOS).
///
/// Compiled into BOTH targets (see project.pbxproj). Every call is
/// best-effort and returns a Bool / optional; callers decide what a failure
/// means for them.
enum KeychainStore {
    static let accessGroup = "group.com.morhogeg.machina"
    static let service = "com.morhogeg.machina.share"
    static let ingestTokenAccount = "ingestToken"

    private static func base(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account,
         kSecAttrAccessGroup as String: accessGroup]
    }

    @discardableResult
    static func set(_ value: String, account: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(base(account) as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(base(account).merging(attrs) { $1 } as CFDictionary, nil)
        }
        return status == errSecSuccess
    }

    static func get(account: String) -> String? {
        var query = base(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    static func delete(account: String) -> Bool {
        let status = SecItemDelete(base(account) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

/// The ONLY hosts the share sheet may post the token to. The endpoint string
/// itself travels through the App Group, so a tampered value must not be able
/// to redirect uploads (and the token) to an arbitrary https server.
enum ShareEndpointPolicy {
    static let allowedHosts: Set<String> = [
        "secondbrain-app-94da2.web.app",
        "secondbrain-app-94da2.firebaseapp.com",
        "mymachina.app",
        "www.mymachina.app",
    ]

    static func isAllowed(_ raw: String) -> Bool {
        guard let url = URL(string: raw),
              url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased() else { return false }
        return allowedHosts.contains(host)
    }
}
