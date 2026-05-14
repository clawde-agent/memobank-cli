/**
 * Noise Filter Module
 * Filters out low-value content before capturing as memory
 * Ported from memory-lancedb-pro
 */

/**
 * Patterns that indicate low-value content
 */
const LOW_VALUE_PATTERNS: RegExp[] = [
  // Greetings and farewells
  /^(hi|hello|hey|goodbye|see you|thanks|thank you)/i,
  // Simple acknowledgments
  /^(ok|okay|sure|yes|no|yeah|yep|nope)/i,
  // Meta-questions about the AI
  /^(are you|can you|do you|will you)/i,
  // File operations without context
  /^(opened|closed|saved|created|deleted) file/i,
  // Trivial changes
  /^(fixed typo|updated comment|reformatted)/i,
];

/**
 * High-value indicators
 */
const HIGH_VALUE_PATTERNS: RegExp[] = [
  // Problem-solving
  /(problem|issue|bug|error|fix|solution|resolved)/i,
  // Decisions and rationale
  /(decided|choice|trade.?off|rationale|because|therefore)/i,
  // Learnings and insights
  /(learned|discovered|realized|insight|understand|now i know)/i,
  // Patterns and best practices
  /(pattern|practice|principle|guideline|rule|strategy)/i,
  // Architecture and design
  /(architecture|design|structure|component|system|module)/i,
  // Performance and optimization
  /(performance|optimize|speed|memory|efficient|scalability)/i,
  // Security
  /(security|vulnerability|authentication|authorization|encryption)/i,
  // Workflows and processes
  /(workflow|process|pipeline|deployment|ci.?cd|automation)/i,
];

/**
 * Check if content is likely noise
 */
export function isNoise(content: string): boolean {
  const trimmed = content.trim();

  // Too short
  if (trimmed.length < 50) {
    return true;
  }

  // Check low-value patterns
  for (const pattern of LOW_VALUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if content has high value indicators
 */
export function hasHighValueIndicators(content: string): boolean {
  for (const pattern of HIGH_VALUE_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate content value score (0-1)
 */
export function calculateValueScore(content: string): number {
  let score = 0.5; // Base score

  // Length factor (longer content tends to be more detailed)
  const lengthFactor = Math.min(1, content.length / 500);
  score += lengthFactor * 0.2;

  // High-value pattern matches
  const highValueMatches = HIGH_VALUE_PATTERNS.filter((p) => p.test(content)).length;
  score += Math.min(0.3, highValueMatches * 0.05);

  // Low-value pattern matches (penalty)
  const lowValueMatches = LOW_VALUE_PATTERNS.filter((p) => p.test(content)).length;
  score -= lowValueMatches * 0.2;

  // Code block presence (often indicates concrete examples)
  if (content.includes('```')) {
    score += 0.1;
  }

  // Structured content (headers, lists)
  if (content.includes('##') || content.includes('- ') || content.includes('1.')) {
    score += 0.1;
  }

  // Clamp to 0-1
  return Math.max(0, Math.min(1, score));
}

/**
 * Filter and rank memories by value
 */
export interface FilteredMemory {
  content: string;
  score: number;
  reason: string;
}

export function filterAndRank(
  memories: Array<{ content: string; name?: string; description?: string }>
): FilteredMemory[] {
  const filtered: FilteredMemory[] = [];

  for (const memory of memories) {
    const { content } = memory;

    // Skip obvious noise
    if (isNoise(content)) {
      console.log(`⊘ Skipped (noise): ${memory.name || memory.description || 'unnamed'}`);
      continue;
    }

    // Calculate score
    const score = calculateValueScore(content);

    // Determine reason
    let reason = '';
    if (score >= 0.7) {
      reason = 'High value - significant learning or decision';
    } else if (score >= 0.5) {
      reason = 'Medium value - useful context';
    } else {
      reason = 'Low value - consider skipping';
    }

    filtered.push({
      content,
      score,
      reason,
    });
  }

  // Sort by score descending
  return filtered.sort((a, b) => b.score - a.score);
}

/**
 * Get recommendation for whether to capture
 */
export function getCaptureRecommendation(score: number): {
  shouldCapture: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
} {
  if (score >= 0.7) {
    return {
      shouldCapture: true,
      confidence: 'high',
      reason: 'High-value content worth remembering',
    };
  } else if (score >= 0.5) {
    return {
      shouldCapture: true,
      confidence: 'medium',
      reason: 'Potentially useful context',
    };
  } else if (score >= 0.3) {
    return {
      shouldCapture: false,
      confidence: 'medium',
      reason: 'Low-value content, consider skipping',
    };
  } else {
    return {
      shouldCapture: false,
      confidence: 'high',
      reason: 'Very low-value content, likely noise',
    };
  }
}
