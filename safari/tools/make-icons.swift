#!/usr/bin/env swift
//
// Regenerates the Mac app icon set from the iOS app's 1024px artwork.
//
//   swift safari/tools/make-icons.swift            (run from the repo root)
//
// Why not reuse the iOS PNG as-is: iOS icons are full-bleed squares that the
// system masks. A Mac icon ships its own shape: a rounded square ("squircle")
// of 824pt inside a 1024pt canvas, transparent margin, soft drop shadow, per
// Apple's macOS icon template. Xcode's safari-web-extension-converter instead
// pastes the 128px extension icon into a white squircle, which is upscaled and
// blurry at every size above 128. This script is the reproducible fix; its
// output is committed so a build never depends on running it.
//
// Source of truth for the artwork stays web/ios/App/App/Assets.xcassets.

import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = root.appendingPathComponent("web/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
let outDir = root.appendingPathComponent("safari/App/Assets.xcassets/AppIcon.appiconset")

guard let art = NSImage(contentsOf: source) else {
    FileHandle.standardError.write("Can't read \(source.path). Run from the repo root.\n".data(using: .utf8)!)
    exit(1)
}

// Continuous-corner squircle (superellipse, n = 5), close to Apple's shape.
func squircle(in r: CGRect, n: CGFloat = 5) -> CGPath {
    let path = CGMutablePath()
    let a = r.width / 2, b = r.height / 2
    let cx = r.midX, cy = r.midY
    let steps = 720
    for i in 0...steps {
        let t = CGFloat(i) / CGFloat(steps) * 2 * .pi
        let c = cos(t), s = sin(t)
        let x = cx + a * (c < 0 ? -1 : 1) * pow(abs(c), 2 / n)
        let y = cy + b * (s < 0 ? -1 : 1) * pow(abs(s), 2 / n)
        if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
    }
    path.closeSubpath()
    return path
}

// Render the master at 1024 once, then downsample (sharper than re-rendering
// the shadow at tiny sizes).
func renderMaster() -> CGImage {
    let size = 1024
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                        space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.interpolationQuality = .high
    let body = CGRect(x: 100, y: 100, width: 824, height: 824)
    let shape = squircle(in: body)

    // Drop shadow (template: ~10pt down, ~20pt blur, 30% black).
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 20,
                  color: CGColor(gray: 0, alpha: 0.30))
    ctx.addPath(shape)
    ctx.setFillColor(CGColor(gray: 0.05, alpha: 1))
    ctx.fillPath()
    ctx.restoreGState()

    // Artwork, clipped to the shape.
    ctx.saveGState()
    ctx.addPath(shape)
    ctx.clip()
    var rect = CGRect(origin: .zero, size: art.size)
    if let cg = art.cgImage(forProposedRect: &rect, context: nil, hints: nil) {
        ctx.draw(cg, in: body)
    }
    ctx.restoreGState()

    // Hairline inner edge so the dark tile still reads on a dark Dock.
    ctx.saveGState()
    ctx.addPath(shape)
    ctx.clip()
    ctx.addPath(shape)
    ctx.setStrokeColor(CGColor(gray: 1, alpha: 0.10))
    ctx.setLineWidth(4)
    ctx.strokePath()
    ctx.restoreGState()

    return ctx.makeImage()!
}

func write(_ image: CGImage, px: Int, name: String) {
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                        space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: px, height: px))
    let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
    let data = rep.representation(using: .png, properties: [:])!
    try! data.write(to: outDir.appendingPathComponent(name))
}

try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let master = renderMaster()

// (point size, scale) pairs required by a macOS AppIcon set.
let specs: [(Int, Int)] = [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)]
var images: [[String: String]] = []
for (pt, scale) in specs {
    let name = "icon_\(pt)x\(pt)\(scale == 2 ? "@2x" : "").png"
    write(master, px: pt * scale, name: name)
    images.append(["idiom": "mac", "size": "\(pt)x\(pt)", "scale": "\(scale)x", "filename": name])
}
let contents: [String: Any] = ["images": images, "info": ["author": "xcode", "version": 1]]
let json = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
try json.write(to: outDir.appendingPathComponent("Contents.json"))
print("Wrote \(specs.count) icons to \(outDir.path)")

// ── Safari toolbar glyph ────────────────────────────────────────────────────
// Safari tints a monochrome toolbar icon like its own buttons (template
// treatment) and shows a full-color one dimmed on sites the extension has no
// access to. The shared extension's icon is a dark full-color tile, which
// reads as a grey blob in Safari's toolbar, so the Safari build swaps in this
// black-on-transparent mark (sync-resources.sh points action.default_icon at
// it). Same geometry as the app mark: two brackets and a dot.
let toolbarDir = root.appendingPathComponent("safari/Extension/Overrides/safari-toolbar")
try FileManager.default.createDirectory(at: toolbarDir, withIntermediateDirectories: true)

func markPath(scale s: CGFloat, dx: CGFloat, dy: CGFloat, height h: CGFloat) -> CGPath {
    // Glyph coordinates from extension/icons/icon.svg (y down), flipped to CG.
    let p = CGMutablePath()
    func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: dx + x * s, y: h - (dy + y * s)) }
    let left: [(CGFloat, CGFloat)] = [(296, 300), (396, 300), (396, 358), (354, 358), (354, 642), (396, 642), (396, 700), (296, 700)]
    let right: [(CGFloat, CGFloat)] = [(728, 300), (628, 300), (628, 358), (670, 358), (670, 642), (628, 642), (628, 700), (728, 700)]
    for poly in [left, right] {
        p.move(to: pt(poly[0].0, poly[0].1))
        for v in poly.dropFirst() { p.addLine(to: pt(v.0, v.1)) }
        p.closeSubpath()
    }
    let c = pt(512, 500)
    p.addEllipse(in: CGRect(x: c.x - 52 * s, y: c.y - 52 * s, width: 104 * s, height: 104 * s))
    return p
}

for px in [16, 19, 32, 38] {
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                        space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let size = CGFloat(px)
    // Glyph box is 432 x 400 (x 296...728, y 300...700); fit it with a
    // one-pixel-per-16 margin so it optically matches Safari's own glyphs.
    let margin = size / 16
    let s = (size - 2 * margin) / 432
    let dx = (size - 432 * s) / 2 - 296 * s
    let dy = (size - 400 * s) / 2 - 300 * s
    ctx.addPath(markPath(scale: s, dx: dx, dy: dy, height: size))
    ctx.setFillColor(CGColor(gray: 0, alpha: 1))
    ctx.fillPath()
    let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
    try rep.representation(using: .png, properties: [:])!
        .write(to: toolbarDir.appendingPathComponent("toolbar-\(px).png"))
}
print("Wrote Safari toolbar glyphs to \(toolbarDir.path)")
