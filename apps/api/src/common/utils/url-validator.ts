import { BadRequestException } from '@nestjs/common';
import { URL } from 'url';
import * as dns from 'dns/promises';
import * as net from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default.svc',
]);

function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0) return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // fc00::/7
    if (normalized.startsWith('fe80')) return true; // fe80::/10
    if (normalized === '::') return true;
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — unwrap and re-check as IPv4
    if (normalized.startsWith('::ffff:')) {
      const embedded = normalized.slice('::ffff:'.length);
      if (net.isIPv4(embedded)) return isPrivateIP(embedded);
    }
    return false;
  }

  return false;
}

/**
 * Validates that a URL points to a public endpoint, not a private/internal network.
 * Throws BadRequestException if the URL targets a private IP or blocked hostname.
 * Resolves DNS once here; the fetch layer re-resolves independently, so this does not close DNS-rebinding/TOCTOU.
 */
export async function assertPublicUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new BadRequestException(`Invalid URL: ${urlString}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException(`URL must use http or https protocol`);
  }

  const hostname = parsed.hostname;

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new BadRequestException(`Access to ${hostname} is not allowed`);
  }

  // Check if hostname is a raw IP
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new BadRequestException(`Access to private IP addresses is not allowed`);
    }
    return;
  }

  // Resolve DNS and check all addresses
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const all = [...addresses, ...addresses6];

    if (all.length === 0) {
      throw new BadRequestException(`URL hostname could not be resolved`);
    }

    for (const addr of all) {
      if (isPrivateIP(addr)) {
        throw new BadRequestException(`URL resolves to a private IP address`);
      }
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException(`URL hostname could not be resolved`);
  }
}
