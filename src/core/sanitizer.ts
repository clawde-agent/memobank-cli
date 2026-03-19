/**
 * Sanitizer module
 * Strips secrets and sensitive information from content before writing to memory
 */

/**
 * Sanitize content by replacing sensitive patterns with [REDACTED]
 */
export function sanitize(content: string): string {
  let sanitized = content;

  // 1. API keys
  // OpenAI: sk-...
  sanitized = sanitized.replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED]');

  // GitHub personal access tokens: ghp_...
  sanitized = sanitized.replace(/ghp_[A-Za-z0-9]{36}/g, '[REDACTED]');

  // Bearer tokens
  sanitized = sanitized.replace(/Bearer [A-Za-z0-9._-]{20,}/g, 'Bearer [REDACTED]');

  // 2. IP addresses
  // IPv4
  sanitized = sanitized.replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, (match) => {
    const parts = match.split('.');
    // Check if it's a valid IP (all parts 0-255)
    if (
      parts.every((part) => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      })
    ) {
      return '[REDACTED]';
    }
    return match;
  });

  // IPv6 (simplified pattern)
  sanitized = sanitized.replace(/\b([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, '[REDACTED]');

  // 3. JWT tokens
  sanitized = sanitized.replace(
    /eyJ[A-Za-z0-9._-]{50,}\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g,
    '[REDACTED]'
  );

  // 4. .env-style variables with long values
  sanitized = sanitized.replace(/[A-Z_]+=["']?[A-Za-z0-9/+]{20,}["']?/g, (match) => {
    // Replace the value part only
    return match.replace(/=["']?[A-Za-z0-9/+]{20,}["']?/, '=[REDACTED]');
  });

  // 5. AWS Access Keys
  sanitized = sanitized.replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]');

  // 6. Generic API keys (alphanumeric with special chars, 20+ chars)
  sanitized = sanitized.replace(/\b[A-Za-z0-9_\-]{20,}\b/g, (match) => {
    // Skip common non-secret patterns
    if (/^[a-f0-9]{32}$/.test(match)) return match; // MD5 hashes
    if (/^[a-f0-9]{40}$/.test(match)) return match; // SHA1 hashes
    if (/^[a-f0-9]{64}$/.test(match)) return match; // SHA256 hashes
    return '[REDACTED]';
  });

  return sanitized;
}
