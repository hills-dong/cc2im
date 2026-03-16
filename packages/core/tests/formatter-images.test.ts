import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Formatter } from "../src/formatter.js";
import { mkdirSync, writeFileSync, unlinkSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Formatter.extractImages", () => {
  const formatter = new Formatter({
    maxMessageLength: { discord: 2000, lark: 30000 },
    maxConcurrentProcesses: 5,
  });

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cc2im-img-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  });

  it("extracts absolute path to an existing image file", () => {
    const imgPath = join(tmpDir, "screenshot.png");
    writeFileSync(imgPath, Buffer.from("fake-png-data"));

    const result = formatter.extractImages(`Check this image ${imgPath} for details`, tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("screenshot.png");
    expect(result[0].mimeType).toBe("image/png");
    expect(result[0].content).toEqual(Buffer.from("fake-png-data"));
  });

  it("extracts relative path resolved against projectDir", () => {
    const subDir = join(tmpDir, "assets");
    mkdirSync(subDir, { recursive: true });
    const imgPath = join(subDir, "photo.jpeg");
    writeFileSync(imgPath, Buffer.from("fake-jpeg-data"));

    const result = formatter.extractImages("See assets/photo.jpeg for reference", tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("photo.jpeg");
    expect(result[0].mimeType).toBe("image/jpeg");
  });

  it("skips duplicate paths", () => {
    const imgPath = join(tmpDir, "dup.png");
    writeFileSync(imgPath, Buffer.from("data"));

    const text = `First ${imgPath} and again ${imgPath}`;
    const result = formatter.extractImages(text, tmpDir);
    expect(result).toHaveLength(1);
  });

  it("returns empty for text with no image paths", () => {
    const result = formatter.extractImages("Just some regular text without any images", tmpDir);
    expect(result).toHaveLength(0);
  });

  it("skips non-existent files", () => {
    const result = formatter.extractImages(`Look at ${tmpDir}/nonexistent.png please`, tmpDir);
    expect(result).toHaveLength(0);
  });

  it("handles jpg mime type conversion (jpg -> jpeg)", () => {
    const imgPath = join(tmpDir, "photo.jpg");
    writeFileSync(imgPath, Buffer.from("fake-jpg-data"));

    const result = formatter.extractImages(`Image at ${imgPath}`, tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("image/jpeg");
  });
});
