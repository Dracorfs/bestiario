import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { optimizeImage, videoToGif } from "./tweet-media";

async function makeTestPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .png()
    .toBuffer();
}

async function makeTestMp4(): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "fixture-mp4-"));
  const outputPath = join(dir, "test.mp4");
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input("testsrc=size=64x64:rate=10:duration=1")
      .inputOptions(["-f", "lavfi"])
      .outputOptions(["-t", "1", "-pix_fmt", "yuv420p"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
  const data = await readFile(outputPath);
  await rm(dir, { recursive: true, force: true });
  return data;
}

describe("optimizeImage", () => {
  it("resizes a large image down and re-encodes as webp", async () => {
    const input = await makeTestPng(2000, 2000);
    const { data, mimeType } = await optimizeImage(input);
    expect(mimeType).toBe("image/webp");
    expect(data.length).toBeLessThan(input.length);
    const meta = await sharp(data).metadata();
    expect(meta.width).toBeLessThanOrEqual(1200);
  });

  it("does not upscale a small image", async () => {
    const input = await makeTestPng(100, 100);
    const { data } = await optimizeImage(input);
    const meta = await sharp(data).metadata();
    expect(meta.width).toBe(100);
  });
}, 20_000);

describe("videoToGif", () => {
  it("transcodes a video into a gif", async () => {
    const input = await makeTestMp4();
    const { data, mimeType } = await videoToGif(input);
    expect(mimeType).toBe("image/gif");
    expect(data.subarray(0, 3).toString("ascii")).toBe("GIF");
  });
}, 30_000);
