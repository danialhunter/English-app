import AppKit
import Foundation

// Layout the supplied official logo intact; no redrawing, cropping or AI regeneration.
guard CommandLine.arguments.count == 3 else {
    fatalError("Usage: swift create-branded-icon.swift <official-logo.png> <output-assets-folder>")
}
let source = URL(fileURLWithPath: CommandLine.arguments[1])
let destination = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
guard let logo = NSImage(contentsOf: source) else { fatalError("Official school logo was not readable.") }
let fileManager = FileManager.default
let iconset = destination.appendingPathComponent("EtonHouse-AppIcon.iconset", isDirectory: true)
try fileManager.createDirectory(at: iconset, withIntermediateDirectories: true)

func render(size: Int) throws -> Data {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: size * 4, bitsPerPixel: 32), let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else { fatalError("Unable to allocate app icon.") }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics
    graphics.imageInterpolation = .high
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: size, height: size).fill()
    let available = CGFloat(size) * 0.87
    let scale = min(available / logo.size.width, available / logo.size.height)
    let logoSize = NSSize(width: logo.size.width * scale, height: logo.size.height * scale)
    logo.draw(in: NSRect(x: (CGFloat(size) - logoSize.width) / 2, y: (CGFloat(size) - logoSize.height) / 2, width: logoSize.width, height: logoSize.height), from: .zero, operation: .sourceOver, fraction: 1)
    graphics.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    guard let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Unable to encode app icon.") }
    return png
}

for size in [16, 32, 128, 256, 512] {
    try render(size: size).write(to: iconset.appendingPathComponent("icon_\(size)x\(size).png"))
    try render(size: size * 2).write(to: iconset.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
try render(size: 1024).write(to: destination.appendingPathComponent("EtonHouse-AppIcon-1024.png"))
print("Prepared exact official-logo icons on an opaque white square.")
