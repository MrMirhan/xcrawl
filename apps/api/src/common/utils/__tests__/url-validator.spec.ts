import { BadRequestException } from '@nestjs/common';

// Mock dns/promises before importing the module under test
jest.mock('dns/promises', () => ({
  resolve4: jest.fn(),
  resolve6: jest.fn(),
}));

import * as dns from 'dns/promises';
import { assertPublicUrl } from '../url-validator';

const mockResolve4 = dns.resolve4 as jest.MockedFunction<typeof dns.resolve4>;
const mockResolve6 = dns.resolve6 as jest.MockedFunction<typeof dns.resolve6>;

describe('assertPublicUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: public IP, no AAAA records
    mockResolve4.mockResolvedValue(['93.184.216.34'] as unknown as Awaited<ReturnType<typeof dns.resolve4>>);
    mockResolve6.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof dns.resolve6>>);
  });

  describe('valid public URLs', () => {
    it('allows https://example.com', async () => {
      await expect(assertPublicUrl('https://example.com')).resolves.toBeUndefined();
    });

    it('allows http://example.com', async () => {
      await expect(assertPublicUrl('http://example.com')).resolves.toBeUndefined();
    });

    it('allows URLs with paths and query strings', async () => {
      await expect(assertPublicUrl('https://example.com/path?q=1')).resolves.toBeUndefined();
    });

    it('allows public IP addresses directly', async () => {
      // 8.8.8.8 is a public IP — no DNS resolution needed
      await expect(assertPublicUrl('https://8.8.8.8')).resolves.toBeUndefined();
    });
  });

  describe('private IP address blocking', () => {
    it('blocks http://127.0.0.1 (loopback)', async () => {
      await expect(assertPublicUrl('http://127.0.0.1')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('http://127.0.0.1')).rejects.toThrow('private IP');
    });

    it('blocks http://10.0.0.1 (class A private)', async () => {
      await expect(assertPublicUrl('http://10.0.0.1')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('http://10.0.0.1')).rejects.toThrow('private IP');
    });

    it('blocks http://192.168.1.1 (class C private)', async () => {
      await expect(assertPublicUrl('http://192.168.1.1')).rejects.toThrow(BadRequestException);
    });

    it('blocks http://172.16.0.1 (class B private, start of range)', async () => {
      await expect(assertPublicUrl('http://172.16.0.1')).rejects.toThrow(BadRequestException);
    });

    it('blocks http://172.31.255.255 (class B private, end of range)', async () => {
      await expect(assertPublicUrl('http://172.31.255.255')).rejects.toThrow(BadRequestException);
    });

    it('allows http://172.15.0.1 (just outside class B private range)', async () => {
      await expect(assertPublicUrl('http://172.15.0.1')).resolves.toBeUndefined();
    });

    it('allows http://172.32.0.1 (just outside class B private range)', async () => {
      await expect(assertPublicUrl('http://172.32.0.1')).resolves.toBeUndefined();
    });

    it('blocks http://169.254.169.254 (cloud metadata / link-local)', async () => {
      await expect(assertPublicUrl('http://169.254.169.254')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('http://169.254.169.254')).rejects.toThrow('private IP');
    });
  });

  describe('blocked hostnames', () => {
    it('blocks http://metadata.google.internal', async () => {
      await expect(assertPublicUrl('http://metadata.google.internal')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('http://metadata.google.internal')).rejects.toThrow('not allowed');
    });

    it('blocks http://metadata.goog', async () => {
      await expect(assertPublicUrl('http://metadata.goog')).rejects.toThrow(BadRequestException);
    });

    it('blocks http://kubernetes.default.svc', async () => {
      await expect(assertPublicUrl('http://kubernetes.default.svc')).rejects.toThrow(BadRequestException);
    });
  });

  describe('protocol validation', () => {
    it('blocks ftp://example.com', async () => {
      await expect(assertPublicUrl('ftp://example.com')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('ftp://example.com')).rejects.toThrow('http or https');
    });

    it('blocks file:///etc/passwd', async () => {
      await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(BadRequestException);
    });

    it('blocks javascript: URLs', async () => {
      await expect(assertPublicUrl('javascript:alert(1)')).rejects.toThrow(BadRequestException);
    });
  });

  describe('invalid URL format', () => {
    it('throws BadRequestException for completely invalid URL', async () => {
      await expect(assertPublicUrl('not-a-url')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('not-a-url')).rejects.toThrow('Invalid URL');
    });

    it('throws BadRequestException for empty string', async () => {
      await expect(assertPublicUrl('')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for URL without protocol', async () => {
      await expect(assertPublicUrl('example.com')).rejects.toThrow(BadRequestException);
    });
  });

  describe('DNS resolution', () => {
    it('throws when DNS resolves to a private IP', async () => {
      mockResolve4.mockResolvedValue(['10.0.0.1'] as unknown as Awaited<ReturnType<typeof dns.resolve4>>);
      mockResolve6.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof dns.resolve6>>);

      await expect(assertPublicUrl('https://internal.example.com')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('https://internal.example.com')).rejects.toThrow('private IP');
    });

    it('throws when DNS resolves to 127.0.0.1', async () => {
      mockResolve4.mockResolvedValue(['127.0.0.1'] as unknown as Awaited<ReturnType<typeof dns.resolve4>>);
      mockResolve6.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof dns.resolve6>>);

      await expect(assertPublicUrl('https://localhost.attacker.com')).rejects.toThrow(BadRequestException);
    });

    it('throws when hostname cannot be resolved (no addresses returned)', async () => {
      mockResolve4.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof dns.resolve4>>);
      mockResolve6.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof dns.resolve6>>);

      await expect(assertPublicUrl('https://nonexistent.invalid')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('https://nonexistent.invalid')).rejects.toThrow('could not be resolved');
    });

    it('throws when DNS lookup throws a network error', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      mockResolve6.mockRejectedValue(new Error('ENOTFOUND'));

      await expect(assertPublicUrl('https://broken-dns.example')).rejects.toThrow(BadRequestException);
    });

    it('resolves successfully when all DNS addresses are public', async () => {
      mockResolve4.mockResolvedValue(['93.184.216.34'] as unknown as Awaited<ReturnType<typeof dns.resolve4>>);
      mockResolve6.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof dns.resolve6>>);

      await expect(assertPublicUrl('https://example.com')).resolves.toBeUndefined();
    });
  });

  describe('IPv4-mapped IPv6 blocking', () => {
    it('blocks AAAA records resolving to ::ffff:127.0.0.1 (mapped loopback)', async () => {
      mockResolve6.mockResolvedValue(['::ffff:127.0.0.1'] as unknown as Awaited<ReturnType<typeof dns.resolve6>>);

      await expect(assertPublicUrl('https://mapped-loopback.example')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('https://mapped-loopback.example')).rejects.toThrow('private IP');
    });

    it('blocks AAAA records resolving to ::ffff:169.254.169.254 (mapped cloud metadata)', async () => {
      mockResolve6.mockResolvedValue(['::ffff:169.254.169.254'] as unknown as Awaited<ReturnType<typeof dns.resolve6>>);

      await expect(assertPublicUrl('https://mapped-metadata.example')).rejects.toThrow(BadRequestException);
      await expect(assertPublicUrl('https://mapped-metadata.example')).rejects.toThrow('private IP');
    });
  });
});
