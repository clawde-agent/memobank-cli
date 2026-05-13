"use strict";
/**
 * Memory Template Module
 * Provides templates and sanitization for memobank memories
 * Aligned with: https://github.com/clawde-agent/memobank/blob/master/docs/specs/2026-03-17-memobank-design.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeContent = sanitizeContent;
exports.checkSensitiveTopics = checkSensitiveTopics;
exports.validateMemoryContent = validateMemoryContent;
exports.generateMemorySlug = generateMemorySlug;
exports.generateMemoryFile = generateMemoryFile;
exports.getTemplateByType = getTemplateByType;
exports.checkAbstractionLevel = checkAbstractionLevel;
/**
 * Patterns for sensitive information detection
 * Design Goal: Safe to share - No secrets, no embeddings, no binary blobs
 */
const SENSITIVE_PATTERNS = [
    // API Keys (various formats)
    { pattern: /sk-[a-zA-Z0-9]{20,}/g, label: 'API Key', replacement: '[REDACTED_API_KEY]' },
    {
        pattern: /api[_-]?key\s*[=:]\s*['"]?[a-zA-Z0-9]{16,}['"]?/gi,
        label: 'API Key',
        replacement: 'api_key=[REDACTED_API_KEY]',
    },
    {
        pattern: /apikey\s*[=:]\s*['"]?[a-zA-Z0-9]{16,}['"]?/gi,
        label: 'API Key',
        replacement: 'apikey=[REDACTED_API_KEY]',
    },
    // AWS
    { pattern: /AKIA[0-9A-Z]{16}/g, label: 'AWS Access Key', replacement: '[REDACTED_AWS_KEY]' },
    {
        pattern: /aws[_-]?access[_-]?key[_-]?id\s*[=:]\s*['"]?[A-Z0-9]{16,}['"]?/gi,
        label: 'AWS Key',
        replacement: 'aws_access_key_id=[REDACTED]',
    },
    {
        pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*['"]?[a-zA-Z0-9/+=]{30,}['"]?/gi,
        label: 'AWS Secret',
        replacement: 'aws_secret_access_key=[REDACTED]',
    },
    // GitHub/GitLab tokens
    {
        pattern: /ghp_[a-zA-Z0-9]{36}/g,
        label: 'GitHub Token',
        replacement: '[REDACTED_GITHUB_TOKEN]',
    },
    {
        pattern: /gho_[a-zA-Z0-9]{36}/g,
        label: 'GitHub OAuth Token',
        replacement: '[REDACTED_GITHUB_TOKEN]',
    },
    {
        pattern: /glpat-[a-zA-Z0-9-]{20,}/g,
        label: 'GitLab Token',
        replacement: '[REDACTED_GITLAB_TOKEN]',
    },
    // Generic tokens
    {
        pattern: /token\s*[=:]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi,
        label: 'Token',
        replacement: 'token=[REDACTED_TOKEN]',
    },
    {
        pattern: /bearer\s+[a-zA-Z0-9_-]{20,}/gi,
        label: 'Bearer Token',
        replacement: 'bearer [REDACTED_TOKEN]',
    },
    // Passwords
    {
        pattern: /password\s*[=:]\s*['"]?[^\s'"]{4,}['"]?/gi,
        label: 'Password',
        replacement: 'password=[REDACTED_PASSWORD]',
    },
    {
        pattern: /passwd\s*[=:]\s*['"]?[^\s'"]{4,}['"]?/gi,
        label: 'Password',
        replacement: 'passwd=[REDACTED_PASSWORD]',
    },
    {
        pattern: /pwd\s*[=:]\s*['"]?[^\s'"]{4,}['"]?/gi,
        label: 'Password',
        replacement: 'pwd=[REDACTED_PASSWORD]',
    },
    // Private keys
    {
        pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
        label: 'Private Key',
        replacement: '[REDACTED_PRIVATE_KEY]',
    },
    // IP addresses (internal and external)
    {
        pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        label: 'IP Address',
        replacement: '[REDACTED_IP]',
    },
    // Email addresses (PII)
    {
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        label: 'Email',
        replacement: '[REDACTED_EMAIL]',
    },
    // Phone numbers (PII)
    {
        pattern: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?)[-.\s]?\d{3}[-.\s]?\d{4}/g,
        label: 'Phone',
        replacement: '[REDACTED_PHONE]',
    },
    // Social Security Numbers (PII)
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: 'SSN', replacement: '[REDACTED_SSN]' },
    // Credit card numbers (PII)
    { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, label: 'Credit Card', replacement: '[REDACTED_CC]' },
    // Database connection strings
    {
        pattern: /mongodb(?:\+srv)?:\/\/[^\s'"]+/g,
        label: 'MongoDB URI',
        replacement: '[REDACTED_DB_URI]',
    },
    {
        pattern: /postgres(?:ql)?:\/\/[^\s'"]+/g,
        label: 'PostgreSQL URI',
        replacement: '[REDACTED_DB_URI]',
    },
    { pattern: /mysql:\/\/[^\s'"]+/g, label: 'MySQL URI', replacement: '[REDACTED_DB_URI]' },
    { pattern: /redis:\/\/[^\s'"]+/g, label: 'Redis URI', replacement: '[REDACTED_DB_URI]' },
    // JWT tokens
    {
        pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
        label: 'JWT',
        replacement: '[REDACTED_JWT]',
    },
    // Secret/Key generic
    {
        pattern: /secret\s*[=:]\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/gi,
        label: 'Secret',
        replacement: 'secret=[REDACTED_SECRET]',
    },
];
/**
 * High-level topics that are safe to store
 */
const SAFE_HIGH_LEVEL_TOPICS = [
    'architecture',
    'design pattern',
    'system design',
    'microservices',
    'api design',
    'database schema',
    'data model',
    'technology stack',
    'framework',
    'library',
    'tool',
    'infrastructure',
    'deployment',
    'ci/cd',
    'pipeline',
    'workflow',
    'process',
    'methodology',
    'best practice',
    'guideline',
    'principle',
    'convention',
    'standard',
];
/**
 * Middle-level topics that are generally safe
 */
const SAFE_MIDDLE_LEVEL_TOPICS = [
    'configuration',
    'setting',
    'option',
    'parameter',
    'environment',
    'connection pool',
    'cache',
    'timeout',
    'retry',
    'error handling',
    'logging',
    'monitoring',
    'testing',
    'debugging',
    'performance',
    'optimization',
    'scaling',
    'load balancing',
    'rate limiting',
    'authentication',
    'authorization',
    'permission',
    'role',
    'access control',
];
/**
 * Sensitive topics that should NOT be stored
 */
const SENSITIVE_TOPICS = [
    'credential',
    'password',
    'secret',
    'token',
    'key',
    'certificate',
    'private key',
    'api key',
    'access token',
    'refresh token',
];
/**
 * Sanitize content by removing sensitive information
 */
function sanitizeContent(content) {
    const redacted = [];
    let sanitized = content;
    for (const { pattern, label, replacement } of SENSITIVE_PATTERNS) {
        const matches = sanitized.match(pattern);
        if (matches && matches.length > 0) {
            redacted.push(...matches.map((m) => `${label}: ${m.substring(0, 20)}...`));
            sanitized = sanitized.replace(pattern, replacement);
        }
    }
    return { sanitized, redacted };
}
/**
 * Check if content contains sensitive topics
 */
function checkSensitiveTopics(content) {
    const found = [];
    const lowerContent = content.toLowerCase();
    for (const topic of SENSITIVE_TOPICS) {
        if (lowerContent.includes(topic)) {
            found.push(topic);
        }
    }
    return found;
}
/**
 * Validate memory content for safety
 */
function validateMemoryContent(content) {
    const warnings = [];
    const errors = [];
    // Check for sensitive patterns
    const { redacted } = sanitizeContent(content);
    if (redacted.length > 0) {
        errors.push(`Found ${redacted.length} sensitive information item(s) that must be removed`);
    }
    // Check for sensitive topics
    const sensitiveTopics = checkSensitiveTopics(content);
    if (sensitiveTopics.length > 0) {
        warnings.push(`Content mentions sensitive topics: ${sensitiveTopics.join(', ')}. Ensure no actual secrets are included.`);
    }
    // Check abstraction level
    const lowerContent = content.toLowerCase();
    const hasHighLevel = SAFE_HIGH_LEVEL_TOPICS.some((t) => lowerContent.includes(t));
    const hasMiddleLevel = SAFE_MIDDLE_LEVEL_TOPICS.some((t) => lowerContent.includes(t));
    if (!hasHighLevel && !hasMiddleLevel) {
        warnings.push('Content may be too specific. Consider documenting at a higher abstraction level.');
    }
    // Check for file paths (potential security risk)
    const filePathPattern = /(?:\/[a-zA-Z0-9._-]+)+\/[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+/g;
    const filePaths = content.match(filePathPattern);
    if (filePaths && filePaths.length > 3) {
        warnings.push('Content contains many file paths. Ensure they are relative and not system-specific.');
    }
    // Check for code snippets with potential secrets
    const codeBlockPattern = /```[\s\S]*?```/g;
    const codeBlocks = content.match(codeBlockPattern);
    if (codeBlocks) {
        for (const block of codeBlocks) {
            const blockLower = block.toLowerCase();
            if (blockLower.includes('password') ||
                blockLower.includes('secret') ||
                blockLower.includes('key')) {
                warnings.push('Code block may contain sensitive variable names. Review before saving.');
            }
        }
    }
    return {
        valid: errors.length === 0,
        warnings,
        errors,
    };
}
/**
 * Generate memory file name (slug format)
 */
function generateMemorySlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}
/**
 * Generate memory file content with frontmatter
 * Aligned with memobank design spec:
 * - Filename: <date>-<name>.md
 * - Frontmatter: YAML with required fields
 * - Body: Free-form Markdown
 * - Design Goal: Human-readable, Git-native, Portable
 */
function generateMemoryFile(template) {
    const slug = generateMemorySlug(template.name);
    const date = template.created.split('T')[0]; // Extract YYYY-MM-DD from ISO date
    const fileName = `${date}-${slug}.md`;
    // Build frontmatter aligned with memobank spec
    const frontmatterFields = {
        name: slug,
        type: template.type,
        description: template.description,
        tags: template.tags,
        created: date, // Use date-only format for readability
    };
    // Add optional fields
    if (template.updated) {
        frontmatterFields.updated = template.updated.split('T')[0];
    }
    if (template.reviewAfter) {
        frontmatterFields.review_after = template.reviewAfter;
    }
    if (template.confidence) {
        frontmatterFields.confidence = template.confidence;
    }
    // Generate YAML frontmatter manually (no external dependency)
    const frontmatter = '---\n' +
        Object.entries(frontmatterFields)
            .map(([key, value]) => {
            if (Array.isArray(value)) {
                return `${key}: [${value.join(', ')}]`;
            }
            return `${key}: ${value}`;
        })
            .join('\n') +
        '\n---\n\n';
    const content = template.content.trim();
    return {
        fileName,
        content: frontmatter + content,
    };
}
/**
 * Get template by type
 * Aligned with memobank design spec directory semantics:
 * - lessons/: Post-mortems, bugs fixed, gotchas
 * - decisions/: ADRs: context, options, decision, consequences
 * - workflows/: Step-by-step runbooks, deploy flows, onboarding
 * - architecture/: System diagrams, component descriptions, data flows
 */
function getTemplateByType(type) {
    const templates = {
        lesson: `## Problem

[Describe the problem or challenge encountered]

## Solution

[Describe the solution or approach that worked]

## Key Takeaways

- [Key insight 1]
- [Key insight 2]
- [Key insight 3]

## Related

- Tags: #topic #technology
- See also: [related memories or documentation]`,
        decision: `## Context

[Describe the situation requiring a decision]

## Options Considered

1. **[Option A]**
   - Pros: [...]
   - Cons: [...]

2. **[Option B]**
   - Pros: [...]
   - Cons: [...]

## Decision

[State the decision made]

## Rationale

[Explain why this decision was made]

## Consequences

[Document expected outcomes and trade-offs]

## Review Date

[When should this decision be reviewed?]`,
        workflow: `## Purpose

[What does this workflow accomplish?]

## Prerequisites

- [Required setup or dependencies]

## Steps

1. **[Step 1]** [Description]
   \`\`\`bash
   [command if applicable]
   \`\`\`

2. **[Step 2]** [Description]

3. **[Step 3]** [Description]

## Troubleshooting

- **Issue**: [Common problem]
  - **Solution**: [How to fix]

## Related

- Commands: \`[relevant commands]\`
- Documentation: [links]`,
        architecture: `## Overview

[High-level description of the architecture]

## Components

### [Component A]

- **Purpose**: [What it does]
- **Technology**: [Tools/frameworks used]
- **Interfaces**: [How it connects to other components]

### [Component B]

- **Purpose**: [What it does]
- **Technology**: [Tools/frameworks used]
- **Interfaces**: [How it connects to other components]

## Data Flow

[Describe how data moves through the system]

## Design Decisions

- **[Decision 1]**: [Rationale]
- **[Decision 2]**: [Rationale]

## Scalability

[How the architecture handles growth]

## Security

[Security considerations and measures]`,
    };
    return templates[type];
}
/**
 * Validate memory abstraction level
 */
function checkAbstractionLevel(content) {
    const lowerContent = content.toLowerCase();
    // Check for high-level indicators
    const highLevelCount = SAFE_HIGH_LEVEL_TOPICS.filter((t) => lowerContent.includes(t)).length;
    const middleLevelCount = SAFE_MIDDLE_LEVEL_TOPICS.filter((t) => lowerContent.includes(t)).length;
    // Check for overly specific indicators
    const specificPatterns = [
        /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, // IP addresses
        /\b[a-f0-9]{32,}\b/, // Hashes/tokens
        /localhost:\d+/, // Localhost with port
        /\/Users\/[a-zA-Z0-9]+/, // User paths
        /\/home\/[a-zA-Z0-9]+/, // Home directories
    ];
    const specificCount = specificPatterns.filter((p) => p.test(content)).length;
    if (specificCount >= 2) {
        return 'too-specific';
    }
    if (highLevelCount >= 3) {
        return 'high';
    }
    if (highLevelCount >= 1 || middleLevelCount >= 2) {
        return 'medium';
    }
    return 'low';
}
//# sourceMappingURL=memory-template.js.map