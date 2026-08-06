import { lookup } from "node:dns/promises";
import { findIsolatedUrlLines } from "./isolated-url";
import { TWEET_URL_LINE_RE } from "./tweet-archive";

const BARE_URL_RE = /^https?:\/\/\S+$/;

export function findIsolatedBookmarkUrlLines(source: string): Map<number, string> {
  return findIsolatedUrlLines(source, (line) => {
    if (TWEET_URL_LINE_RE.test(line)) return null;
    return BARE_URL_RE.test(line) ? line : null;
  });
}

export function extractBookmarkUrls(source: string): string[] {
  return [...new Set(findIsolatedBookmarkUrlLines(source).values())];
}

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  if (long === null) return true;
  const inRange = (base: string, bits: number) => {
    const baseLong = ipv4ToLong(base);
    if (baseLong === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (long & mask) === (baseLong & mask);
  };
  return (
    inRange("10.0.0.0", 8) ||
    inRange("172.16.0.0", 12) ||
    inRange("192.168.0.0", 16) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) ||
    inRange("0.0.0.0", 8)
  );
}

export function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.includes(":")) {
    if (lower === "::1") return true;
    if (lower.startsWith("::ffff:")) {
      return isPrivateIpv4(lower.slice("::ffff:".length));
    }
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    return false;
  }
  return isPrivateIpv4(lower);
}

export async function assertPublicUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`unsupported protocol: ${parsed.protocol}`);
  }
  const { address } = await lookup(parsed.hostname);
  if (isPrivateIp(address)) {
    throw new Error(`refusing to fetch private/internal address: ${address}`);
  }
}
