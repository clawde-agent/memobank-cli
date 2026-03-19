/**
 * Tests for memory-template module
 */

import { describe, it, expect } from '@jest/globals';
import {
  sanitizeContent,
  validateMemoryContent,
  checkAbstractionLevel,
  generateMemorySlug,
  generateMemoryFile,
  getTemplateByType,
} from '../src/core/memory-template';

describe('memory-template', () => {
  describe('generateMemorySlug', () => {
    it('should convert to lowercase and replace spaces with hyphens', () => {
      expect(generateMemorySlug('Hello World')).toBe('hello-world');
    });

    it('should remove special characters', () => {
      expect(generateMemorySlug('Hello@World!')).toBe('hello-world');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(generateMemorySlug('--Hello--')).toBe('hello');
    });

    it('should limit length to 60 characters', () => {
      const long = 'a'.repeat(100);
      expect(generateMemorySlug(long).length).toBe(60);
    });
  });

  describe('sanitizeContent', () => {
    it('should redact API keys', () => {
      const content = 'My API key is sk-abc123def456ghi789jkl012mno345';
      const { sanitized, redacted } = sanitizeContent(content);
      expect(redacted.length).toBeGreaterThan(0);
      expect(sanitized).toContain('[REDACTED_API_KEY]');
      expect(sanitized).not.toContain('sk-abc123');
    });

    it('should redact passwords', () => {
      const content = 'password = supersecret123';
      const { sanitized, redacted } = sanitizeContent(content);
      expect(redacted.length).toBeGreaterThan(0);
      expect(sanitized).toContain('[REDACTED_PASSWORD]');
    });

    it('should redact IP addresses', () => {
      const content = 'Server at 192.168.1.100';
      const { sanitized } = sanitizeContent(content);
      expect(sanitized).toContain('[REDACTED_IP]');
    });

    it('should redact email addresses', () => {
      const content = 'Contact: user@example.com';
      const { sanitized } = sanitizeContent(content);
      expect(sanitized).toContain('[REDACTED_EMAIL]');
    });

    it('should redact AWS keys', () => {
      const content = 'AKIAIOSFODNN7EXAMPLE';
      const { sanitized } = sanitizeContent(content);
      expect(sanitized).toContain('[REDACTED_AWS_KEY]');
    });

    it('should redact GitHub tokens', () => {
      const content = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const { sanitized } = sanitizeContent(content);
      expect(sanitized).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    it('should redact database URIs', () => {
      const content = 'mongodb://user:pass@localhost:27017/db';
      const { sanitized } = sanitizeContent(content);
      expect(sanitized).toContain('[REDACTED_DB_URI]');
    });

    it('should redact JWT tokens', () => {
      const content = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGVzdA';
      const { sanitized } = sanitizeContent(content);
      expect(sanitized).toContain('[REDACTED_JWT]');
    });

    it('should handle content without sensitive data', () => {
      const content = 'This is safe content with no secrets.';
      const { sanitized, redacted } = sanitizeContent(content);
      expect(redacted.length).toBe(0);
      expect(sanitized).toBe(content);
    });
  });

  describe('validateMemoryContent', () => {
    it('should pass valid high-level content', () => {
      const content = `
        ## Architecture Decision
        
        We chose microservices architecture for better scalability.
        The system uses API Gateway pattern for routing requests.
      `;
      const result = validateMemoryContent(content);
      expect(result.errors.length).toBe(0);
    });

    it('should warn about sensitive topics', () => {
      const content = 'We store the password in the config file.';
      const result = validateMemoryContent(content);
      expect(result.warnings.some((w) => w.includes('password'))).toBe(true);
    });

    it('should error on content with secrets', () => {
      const content = 'API key: sk-abc123def456ghi789jkl012mno345';
      const result = validateMemoryContent(content);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('checkAbstractionLevel', () => {
    it('should identify high-level content', () => {
      const content = `
        We use microservices architecture with API Gateway pattern.
        The system follows SOLID principles and uses dependency injection.
      `;
      expect(checkAbstractionLevel(content)).toBe('high');
    });

    it('should identify medium-level content', () => {
      const content = `
        Configure the connection pool with max=10 and timeout=5000ms.
        Use retry logic with exponential backoff.
      `;
      expect(checkAbstractionLevel(content)).toBe('medium');
    });

    it('should identify too-specific content', () => {
      const content = `
        Edit /Users/john.doe/projects/myapp/src/config.js
        Change line 42 to use localhost:3000
        Set API key to sk-abc123
      `;
      expect(checkAbstractionLevel(content)).toBe('too-specific');
    });
  });

  describe('generateMemoryFile', () => {
    it('should generate valid markdown with frontmatter', () => {
      const template = {
        name: 'test-memory',
        type: 'lesson' as const,
        description: 'A test memory',
        tags: ['test', 'demo'],
        created: '2026-03-19T12:00:00.000Z',
        confidence: 'high' as const,
        content: '## Test Content\n\nThis is test content.',
      };

      const { fileName, content } = generateMemoryFile(template);

      expect(fileName).toMatch(/^\d{4}-\d{2}-\d{2}-test-memory\.md$/);
      expect(content).toContain('---');
      expect(content).toContain('name: test-memory');
      expect(content).toContain('type: lesson');
      expect(content).toContain('tags: [test, demo]');
      expect(content).toContain('## Test Content');
    });

    it('should include optional fields when provided', () => {
      const template = {
        name: 'test-memory',
        type: 'decision' as const,
        description: 'A test decision',
        tags: ['test'],
        created: '2026-03-19T12:00:00.000Z',
        updated: '2026-03-20T12:00:00.000Z',
        reviewAfter: '90d',
        confidence: 'medium' as const,
        content: 'Content here',
      };

      const { content } = generateMemoryFile(template);

      expect(content).toContain('updated: 2026-03-20');
      expect(content).toContain('review_after: 90d');
      expect(content).toContain('confidence: medium');
    });
  });

  describe('getTemplateByType', () => {
    it('should return template for lesson', () => {
      const template = getTemplateByType('lesson');
      expect(template).toContain('## Problem');
      expect(template).toContain('## Solution');
    });

    it('should return template for decision', () => {
      const template = getTemplateByType('decision');
      expect(template).toContain('## Context');
      expect(template).toContain('## Options Considered');
    });

    it('should return template for workflow', () => {
      const template = getTemplateByType('workflow');
      expect(template).toContain('## Steps');
      expect(template).toContain('## Prerequisites');
    });

    it('should return template for architecture', () => {
      const template = getTemplateByType('architecture');
      expect(template).toContain('## Components');
      expect(template).toContain('## Data Flow');
    });
  });
});
