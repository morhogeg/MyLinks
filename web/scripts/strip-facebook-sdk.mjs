// iOS build step: drop the Facebook SDK from @capacitor-firebase/authentication.
//
// The plugin's Swift package always links facebook-ios-sdk (FacebookCore +
// FacebookLogin) and compiles its Facebook provider in with the
// RGCFA_INCLUDE_FACEBOOK flag. Machina signs in with Apple and Google only,
// so the SDK was dead weight in every build: megabytes of binary, and a
// privacy manifest that declares tracking domains inside an app whose App
// Privacy label says it does not track. Every Facebook line in the plugin's
// Swift sits behind that flag (launch audit IOS-3, checked line by line), so
// removing the flag and the dependency builds the plugin without it, the same
// way its CocoaPods subspecs already allow.
//
// Run after `npm ci` and before xcodebuild resolves packages
// (ios-testflight.yml, build-ios.sh). Idempotent. Exits non-zero when the
// manifest no longer looks the way this expects, so a plugin upgrade is
// noticed instead of silently linking the SDK again or breaking the manifest.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const REMOVABLE = [
    /^\s*\.package\(url: "https:\/\/github\.com\/facebook\/facebook-ios-sdk(\.git)?", [^)]*\),?\s*$/,
    /^\s*\.product\(name: "Facebook(Core|Login)", package: "facebook-ios-sdk"\),?\s*$/,
    /^\s*\.define\("RGCFA_INCLUDE_FACEBOOK"\),?\s*$/,
];

/**
 * The manifest without its Facebook lines, or throws if a Facebook mention is
 * left that this doesn't recognise. Removing the last element of a Swift
 * array literal leaves the previous line's comma behind, which Swift accepts.
 */
export function stripFacebook(manifest) {
    const kept = [];
    let removed = 0;
    for (const line of manifest.split('\n')) {
        if (REMOVABLE.some((re) => re.test(line))) {
            removed += 1;
            continue;
        }
        kept.push(line);
    }
    const out = kept.join('\n');
    const leftover = out.split('\n').filter((l) => /facebook/i.test(l));
    if (leftover.length) {
        throw new Error(`unrecognised Facebook lines in the manifest:\n${leftover.join('\n')}`);
    }
    if (!/RGCFA_INCLUDE_GOOGLE/.test(out) || !/GoogleSignIn/.test(out)) {
        throw new Error('the manifest no longer has the Google sign-in pieces this expects');
    }
    return { manifest: out, removed };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    const path = join(webRoot, 'node_modules', '@capacitor-firebase', 'authentication', 'Package.swift');
    try {
        const { manifest, removed } = stripFacebook(readFileSync(path, 'utf8'));
        if (removed) writeFileSync(path, manifest);
        console.log(removed
            ? `strip-facebook-sdk: removed ${removed} Facebook lines from ${path}`
            : 'strip-facebook-sdk: already stripped');
    } catch (e) {
        console.error(`strip-facebook-sdk: ${e.message}`);
        process.exit(1);
    }
}
