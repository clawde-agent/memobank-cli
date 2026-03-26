export type { CaptureProviderName, CaptureConfig } from '../types';
import type { ExtractionResult } from '../types';

export interface CaptureProvider {
  extract(sessionText: string): Promise<ExtractionResult[]>;
}
