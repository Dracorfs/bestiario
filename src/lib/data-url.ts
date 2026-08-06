export function dataUrlToBuffer(dataUrl: string): { data: Buffer; mimeType: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  const mimeType = match?.[1];
  const base64 = match?.[2];
  if (!mimeType || !base64) throw new Error("invalid data URL");
  return { data: Buffer.from(base64, "base64"), mimeType };
}

export function bufferToDataUrl(data: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${data.toString("base64")}`;
}
