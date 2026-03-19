import { sanitize, scanForSecrets } from '../src/core/sanitizer';

describe('sanitize — new patterns', () => {
  it('redacts semantic password pattern', () => {
    const result = sanitize('The password is mySecret123');
    expect(result).not.toContain('mySecret123');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts semantic secret= pattern', () => {
    const result = sanitize('secret=abc123xyz');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Chinese password pattern', () => {
    const result = sanitize('密码是abc123xyz');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Chinese key pattern', () => {
    const result = sanitize('密钥为sk-abc123xyz');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts private IP 192.168.x.x', () => {
    const result = sanitize('server at 192.168.1.100');
    expect(result).not.toContain('192.168.1.100');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts private IP 10.x.x.x', () => {
    const result = sanitize('host 10.0.0.5 is internal');
    expect(result).not.toContain('10.0.0.5');
    expect(result).toContain('[REDACTED]');
  });

  it('does NOT redact version numbers like 1.10.2', () => {
    const result = sanitize('Using version v1.10.2 of the library');
    expect(result).toContain('1.10.2');
  });

  it('does NOT redact dates like 2026-03-10', () => {
    const result = sanitize('Created on 2026-03-10');
    expect(result).toContain('2026-03-10');
  });
});

describe('scanForSecrets', () => {
  it('returns empty array for clean content', () => {
    const findings = scanForSecrets('This is a lesson about Redis pooling.');
    expect(findings).toHaveLength(0);
  });

  it('detects API key in content', () => {
    const findings = scanForSecrets('key = sk-abcdefghijklmnop12345678');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('detects password pattern', () => {
    const findings = scanForSecrets('The password is secretvalue');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('returns line numbers with findings', () => {
    const content = 'clean line\npassword is mysecret\nclean line';
    const findings = scanForSecrets(content);
    expect(findings[0]).toContain('line 2');
  });
});
