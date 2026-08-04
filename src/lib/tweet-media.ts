import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

export async function optimizeImage(
  input: Buffer,
): Promise<{ data: Buffer; mimeType: string }> {
  const data = await sharp(input)
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return { data, mimeType: "image/webp" };
}

export async function videoToGif(
  input: Buffer,
): Promise<{ data: Buffer; mimeType: string }> {
  const dir = await mkdtemp(join(tmpdir(), "tweet-video-"));
  const inputPath = join(dir, `${randomUUID()}.mp4`);
  const outputPath = join(dir, `${randomUUID()}.gif`);
  try {
    await writeFile(inputPath, input);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(["-an", "-vf", "fps=10,scale=480:-1:flags=lanczos"])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", reject)
        .run();
    });
    const data = await readFile(outputPath);
    return { data, mimeType: "image/gif" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
