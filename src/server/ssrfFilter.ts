/**
 * Server-Side Request Forgery (SSRF) Protection Filter
 * for Z1 Movies Platform.
 * 
 * Blocks access to:
 * - Loopback addresses (127.0.0.1, ::1, localhost, 0.0.0.0)
 * - Private IPv4 addresses:
 *   - 10.0.0.0/8
 *   - 172.16.0.0/12
 *   - 192.168.0.0/16
 * - Link-local / Cloud metadata service (169.254.169.254, 169.254.0.0/16)
 * - Carrier-grade NAT (100.64.0.0/10)
 * - Internal hostnames (*.local, *.internal, metadata.google.internal)
 * - Dangerous protocols (file:, gopher:, dict:, ftp:, data:)
 */

import net from 'net';

const PRIVATE_SUBNETS = [
  // 127.0.0.0/8 (Loopback)
  { start: 0x7f000000, end: 0x7fffffff },
  // 10.0.0.0/8 (Private Network)
  { start: 0x0a000000, end: 0x0affffff },
  // 172.16.0.0/12 (Private Network)
  { start: 0xac100000, end: 0xac1fffff },
  // 192.168.0.0/16 (Private Network)
  { start: 0xc0a80000, end: 0xc0a8ffff },
  // 169.254.0.0/16 (Link Local / Cloud Metadata)
  { start: 0xa9fe0000, end: 0xa9feffff },
  // 0.0.0.0/8 (Current network)
  { start: 0x00000000, end: 0x00ffffff },
  // 100.64.0.0/10 (Shared Address Space)
  { start: 0x64400000, end: 0x647fffff },
];

function ipToNumber(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function isSafePublicUrl(urlString: string): { isSafe: boolean; reason?: string } {
  if (!urlString || typeof urlString !== 'string') {
    return { isSafe: false, reason: 'URL is required' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { isSafe: false, reason: 'Invalid URL format' };
  }

  // Only HTTP and HTTPS are permitted
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isSafe: false, reason: `Protocol '${parsed.protocol}' is prohibited for security` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check dangerous local hostnames
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.includes('metadata.google') ||
    hostname.includes('instance-data')
  ) {
    return { isSafe: false, reason: 'Destination resolves to private loopback or internal metadata service' };
  }

  // Check if hostname is an IPv4 address
  if (net.isIPv4(hostname)) {
    const num = ipToNumber(hostname);
    for (const subnet of PRIVATE_SUBNETS) {
      if (num >= subnet.start && num <= subnet.end) {
        return { isSafe: false, reason: 'Destination resolves to private network range' };
      }
    }
  }

  // Check if hostname is an IPv6 address
  if (net.isIPv6(hostname)) {
    if (
      hostname === '::1' ||
      hostname.startsWith('fe80:') || // link-local
      hostname.startsWith('fc00:') || // unique local
      hostname.startsWith('fd00:')
    ) {
      return { isSafe: false, reason: 'Destination resolves to private IPv6 address' };
    }
  }

  return { isSafe: true };
}
