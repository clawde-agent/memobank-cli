/**
 * Smart Extractor module
 * LLM-powered extraction for memo capture
 * Ported from memory-lancedb-pro
 */
import { ExtractionResult } from '../types';
/**
 * Extract memories from session text using LLM
 * Falls back to no-op if no API key is configured
 */
export declare function extract(sessionText: string, apiKey?: string, model?: string): Promise<ExtractionResult[]>;
//# sourceMappingURL=smart-extractor.d.ts.map