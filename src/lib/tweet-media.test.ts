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

async function makeTestMp4(durationSeconds = 1): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "fixture-mp4-"));
  const outputPath = join(dir, "test.mp4");
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(`testsrc=size=64x64:rate=10:duration=${durationSeconds}`)
      .inputOptions(["-f", "lavfi"])
      .outputOptions(["-t", String(durationSeconds), "-pix_fmt", "yuv420p"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
  const data = await readFile(outputPath);
  await rm(dir, { recursive: true, force: true });
  return data;
}

function countGifFrames(data: Buffer): number {
  let count = 0;
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0x21 && data[i + 1] === 0xf9) count++;
  }
  return count;
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
    const width = data.readUInt16LE(6);
    expect(width).toBeLessThanOrEqual(220);
  });

  it("caps output to ~4 seconds regardless of input length, keeping file size small", async () => {
    // A long-running real tweet video (2m47s) previously produced a 100MB+
    // gif with no duration cap. A 10s input here should still be trimmed to
    // ~4s worth of frames (fps=6 => ~24 frames), not ~60.
    const input = await makeTestMp4(10);
    const { data } = await videoToGif(input);
    const frameCount = countGifFrames(data);
    expect(frameCount).toBeGreaterThan(0);
    expect(frameCount).toBeLessThanOrEqual(30);
    expect(data.length).toBeLessThan(1024 * 1024);
  });
}, 30_000);
