/**
 * Sanitizer module
 * Strips secrets and sensitive information from content before writing to memory
 */

/** Patterns used both for sanitization and scanning */
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-[A-Za-z0-9]{20,}/g, label: 'OpenAI API key' },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, label: 'GitHub token' },
  { pattern: /Bearer [A-Za-z0-9._-]{20,}/g, label: 'Bearer token' },
  { pattern: /AKIA[0-9A-Z]{16}/g, label: 'AWS access key' },
  { pattern: /eyJ[A-Za-z0-9._-]{50,}\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g, label: 'JWT token' },
  { pattern: /[A-Z_]+=["']?[A-Za-z0-9/+]{20,}["']?/g, label: '.env secret' },
  // IPv4 private ranges (full octets to avoid matching version numbers/dates)
  { pattern: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g, label: 'private IP (192.168.x.x)' },
  { pattern: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, label: 'private IP (10.x.x.x)' },
  {
    pattern: /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g,
    label: 'private IP (172.16-31.x.x)',
  },
  // IPv6
  { pattern: /\b([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, label: 'IPv6 address' },
  // Semantic password/secret patterns
  { pattern: /password\s*(is|=|:)\s*\S+/gi, label: 'password value' },
  { pattern: /secret\s*(is|=|:)\s*\S+/gi, label: 'secret value' },
  { pattern: /token\s*(is|=|:)\s*\S+/gi, label: 'token value' },
  // Chinese-language patterns
  { pattern: /密码[是为：:]\s*\S+/g, label: '中文密码' },
  { pattern: /密钥[是为：:]\s*\S+/g, label: '中文密钥' },
];

/**
 * Sanitize content by replacing sensitive patterns with [REDACTED]
 */
export function sanitize(content: string): string {
  let sanitized = content;

  for (const { pattern } of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Generic 20+ char alphanumeric (excludes hashes)
  sanitized = sanitized.replace(/\b[A-Za-z0-9_-]{20,}\b/g, (match) => {
    if (/^[a-f0-9]{32}$/.test(match)) {
      return match;
    } // MD5
    if (/^[a-f0-9]{40}$/.test(match)) {
      return match;
    } // SHA1
    if (/^[a-f0-9]{64}$/.test(match)) {
      return match;
    } // SHA256
    return '[REDACTED]';
  });

  return sanitized;
}

export interface SecretFinding {
  line: number;
  content: string;
  label: string;
}

/**
 * Scan content for potential secrets without modifying it.
 * Returns human-readable findings with line numbers.
 */
export function scanForSecrets(content: string): string[] {
  const lines = content.split('\n');
  const findings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, label } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        findings.push(`line ${i + 1} (${label}): ${line.substring(0, 120)}`);
        break; // one finding per line
      }
    }
  }

  return findings;
}
