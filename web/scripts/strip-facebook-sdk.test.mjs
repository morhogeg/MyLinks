import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripFacebook } from './strip-facebook-sdk.mjs';

// @capacitor-firebase/authentication 8.x Package.swift, verbatim.
const MANIFEST = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorFirebaseAuthentication",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapacitorFirebaseAuthentication",
            targets: ["FirebaseAuthenticationPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "12.7.0")),
        .package(url: "https://github.com/google/GoogleSignIn-iOS", from: "9.0.0"),
        .package(url: "https://github.com/facebook/facebook-ios-sdk.git", from: "18.0.0")
    ],
    targets: [
        .target(
            name: "FirebaseAuthenticationPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS"),
                .product(name: "FacebookCore", package: "facebook-ios-sdk"),
                .product(name: "FacebookLogin", package: "facebook-ios-sdk")
            ],
            path: "ios/Plugin",
            swiftSettings: [
                .define("RGCFA_INCLUDE_GOOGLE"),
                .define("RGCFA_INCLUDE_FACEBOOK")
            ]),
        .testTarget(
            name: "FirebaseAuthenticationPluginTests",
            dependencies: ["FirebaseAuthenticationPlugin"],
            path: "ios/PluginTests")
    ]
)
`;

test('removes the Facebook package, both products and the flag, nothing else', () => {
    const { manifest, removed } = stripFacebook(MANIFEST);
    assert.equal(removed, 4);
    assert.doesNotMatch(manifest, /facebook/i);
    const before = MANIFEST.split('\n').length;
    assert.equal(manifest.split('\n').length, before - 4);
    for (const kept of ['GoogleSignIn-iOS', 'firebase-ios-sdk', 'RGCFA_INCLUDE_GOOGLE', 'capacitor-swift-pm']) {
        assert.match(manifest, new RegExp(kept));
    }
    // The previous element keeps its comma: a trailing comma in a Swift array
    // literal is valid, and every list here is an array literal.
    assert.match(manifest, /\.package\(url: "https:\/\/github\.com\/google\/GoogleSignIn-iOS", from: "9\.0\.0"\),\n    \]/);
    assert.match(manifest, /\.define\("RGCFA_INCLUDE_GOOGLE"\),\n            \]\)/);
});

test('is idempotent', () => {
    const once = stripFacebook(MANIFEST).manifest;
    const twice = stripFacebook(once);
    assert.equal(twice.removed, 0);
    assert.equal(twice.manifest, once);
});

test('refuses a manifest whose Facebook lines it does not recognise', () => {
    const changed = MANIFEST.replace('.product(name: "FacebookCore", package: "facebook-ios-sdk")',
        '.product(name: "FacebookCore", package: "facebook-ios-sdk", condition: .when(platforms: [.iOS]))');
    assert.throws(() => stripFacebook(changed), /unrecognised Facebook lines/);
});
