import type { PendingCandidate } from './store';
import type { MemoryFile, CaptureConfig } from '../types';

export type DedupLLM = (
  pairs: Array<{ candidate: PendingCandidate; existing: MemoryFile }>
) => Promise<Array<'DUPLICATE' | 'KEEP_BOTH'>>;

export async function deduplicate(
  candidates: PendingCandidate[],
  existing: MemoryFile[],
  llm?: DedupLLM
): Promise<{ toWrite: PendingCandidate[]; toSkip: PendingCandidate[] }> {
  const { toWrite, toSkip, ambiguous } = jaccardPartition(candidates, existing);

  // Stage 2: LLM for ambiguous pairs
  if (ambiguous.length > 0) {
    if (llm) {
      try {
        const decisions = await llm(ambiguous);
        for (let i = 0; i < ambiguous.length; i++) {
          if (decisions[i] === 'DUPLICATE') {
            toSkip.push(ambiguous[i].candidate);
          } else {
            toWrite.push(ambiguous[i].candidate);
          }
        }
      } catch (err) {
        console.warn(
          `Stage 2 dedup LLM failed: ${(err as Error).message} — treating ambiguous as KEEP_BOTH`
        );
        for (const { candidate } of ambiguous) {
          toWrite.push(candidate);
        }
      }
    } else {
      for (const { candidate } of ambiguous) {
        toWrite.push(candidate);
      }
    }
  }

  return { toWrite, toSkip };
}

/**
 * Similarity score: max of word-level Jaccard and character-trigram Jaccard.
 * Word-level captures shared vocabulary; trigrams capture near-identical names
 * that differ by only a suffix (e.g. "handling" vs "handler").
 */
function jaccard(a: string, b: string): number {
  return Math.max(wordJaccard(a, b), trigramJaccard(a, b));
}

function wordJaccard(a: string, b: string): number {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  const intersection = [...tokA].filter((t) => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function trigramJaccard(a: string, b: string): number {
  const tokA = trigrams(a);
  const tokB = trigrams(b);
  const intersection = [...tokA].filter((t) => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}

function trigrams(text: string): Set<string> {
  const t = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const result = new Set<string>();
  for (let i = 0; i <= t.length - 3; i++) {
    result.add(t.slice(i, i + 3));
  }
  return result;
}

// ─── LLM factory for dedup callbacks ─────────────────────────────────────────

const DEDUP_SYSTEM_PROMPT = `You are a memory deduplication assistant.
Given pairs of (candidate, existing) memory entries, decide for each pair whether to store, skip, update, or merge.

Return ONLY a JSON array, one object per pair, in order:
[{ "action": "store" | "skip" | "update" | "merge", "targetName": "<existing name if update/merge>", "updatedContent": "<merged markdown if update/merge>" }]

Rules:
- "skip": candidate is a duplicate or subset of existing
- "store": candidate contains genuinely new information
- "update": candidate has new info that should be merged INTO existing (provide updatedContent)
- "merge": both have complementary value (provide updatedContent combining both)
Prefer "skip" when in doubt.`;

export function createDedupLLM(config: CaptureConfig): DedupBatchLLM {
  return async (items) => {
    const pairs = items.map(({ candidate, existing }, i) => ({
      index: i,
      candidate: { name: candidate.name, description: candidate.description },
      existing: { name: existing.name, description: existing.description },
    }));

    const userMessage = `Evaluate these ${pairs.length} candidate/existing pairs:\n${JSON.stringify(pairs, null, 2)}`;

    try {
      const base = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
      const response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey ?? 'local'}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 512,
          messages: [
            { role: 'system', content: DEDUP_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
      });

      if (!response.ok) {
        return items.map(() => ({ action: 'store' as const }));
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const rawText = (data.choices?.[0]?.message?.content ?? '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return items.map(() => ({ action: 'store' as const }));

      const parsed = JSON.parse(jsonMatch[0]) as DedupBatchAction[];
      if (!Array.isArray(parsed) || parsed.length !== items.length) {
        return items.map(() => ({ action: 'store' as const }));
      }
      return parsed;
    } catch {
      return items.map(() => ({ action: 'store' as const }));
    }
  };
}

// ─── LLM Batch Dedup for Capture Pipeline ────────────────────────────────────

export interface DedupBatchAction {
  action: 'store' | 'skip' | 'update' | 'merge';
  targetName?: string;
  updatedContent?: string;
}

export type DedupBatchLLM = (
  items: Array<{ candidate: PendingCandidate; existing: MemoryFile }>
) => Promise<DedupBatchAction[]>;

export interface DedupBatchResult {
  toWrite: PendingCandidate[];
  toSkip: PendingCandidate[];
  toUpdate: Array<{ candidate: PendingCandidate; targetName: string; updatedContent?: string }>;
}

const INJECTION_PATTERNS = [
  /ignore\b.{0,30}\b(instructions|rules|guidelines)/i,
  /disregard\b.{0,30}\b(instructions|rules)/i,
  /you are now (?!going|about|ready)/i,
  /(?:ignore|forget|override)\b.{0,20}\b(previous|above|prior)/i,
  // Chinese: "ignore [all/previous] instructions/rules", "disregard instructions/rules/limits"
  /忽略(?:所有|之前|以上|先前)?(?:的)?(?:指令|规则)/,
  /无视(?:所有|之前|以上)?(?:的)?(?:指令|规则|限制)/,
];

function looksLikeInjection(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return INJECTION_PATTERNS.some((p) => p.test(normalized));
}

interface PartitionResult {
  toWrite: PendingCandidate[];
  toSkip: PendingCandidate[];
  ambiguous: Array<{ candidate: PendingCandidate; existing: MemoryFile }>;
}

function jaccardPartition(candidates: PendingCandidate[], existing: MemoryFile[]): PartitionResult {
  const toWrite: PendingCandidate[] = [];
  const toSkip: PendingCandidate[] = [];
  const ambiguous: Array<{ candidate: PendingCandidate; existing: MemoryFile }> = [];

  for (const candidate of candidates) {
    // Injection guard — unified for both deduplicate() and dedupLLMBatch()
    const combined = `${candidate.name} ${candidate.description} ${candidate.content}`;
    if (looksLikeInjection(combined)) {
      toSkip.push(candidate);
      continue;
    }

    if (existing.some((e) => e.name === candidate.name)) {
      toSkip.push(candidate);
      continue;
    }

    const candidateText = `${candidate.name} ${candidate.description}`;
    let maxScore = 0;
    let closestExisting: MemoryFile | undefined;
    for (const e of existing) {
      const score = jaccard(candidateText, `${e.name} ${e.description}`);
      if (score > maxScore) {
        maxScore = score;
        closestExisting = e;
      }
    }

    if (maxScore >= 0.8) {
      toSkip.push(candidate);
    } else if (maxScore >= 0.4 && closestExisting) {
      ambiguous.push({ candidate, existing: closestExisting });
    } else {
      toWrite.push(candidate);
    }
  }

  return { toWrite, toSkip, ambiguous };
}

export async function dedupLLMBatch(
  candidates: PendingCandidate[],
  existing: MemoryFile[],
  llm?: DedupBatchLLM
): Promise<DedupBatchResult> {
  const toUpdate: DedupBatchResult['toUpdate'] = [];
  const { toWrite, toSkip, ambiguous } = jaccardPartition(candidates, existing);

  if (ambiguous.length > 0 && llm) {
    try {
      const decisions = await llm(ambiguous);
      for (let i = 0; i < ambiguous.length; i++) {
        const decision = decisions[i];
        const { candidate } = ambiguous[i]!;
        if (!decision || decision.action === 'skip') {
          toSkip.push(candidate);
        } else if (decision.action === 'store') {
          toWrite.push(candidate);
        } else if (
          (decision.action === 'update' || decision.action === 'merge') &&
          decision.targetName
        ) {
          toUpdate.push({
            candidate,
            targetName: decision.targetName,
            updatedContent: decision.updatedContent,
          });
        } else {
          toWrite.push(candidate);
        }
      }
    } catch {
      for (const { candidate } of ambiguous) toWrite.push(candidate);
    }
  } else {
    for (const { candidate } of ambiguous) toWrite.push(candidate);
  }

  return { toWrite, toSkip, toUpdate };
}
