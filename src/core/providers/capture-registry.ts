import type { CaptureProviderName, CaptureConfig } from '../../types';
import type { CaptureProvider } from '../capture-provider';

export interface CaptureProviderDescriptor {
  readonly name: CaptureProviderName;
  readonly label: string;
  readonly requiresApiKey: boolean;
  readonly requiresBaseUrlStep: boolean;
  readonly apiKeyEnv?: string;
  readonly defaultBaseUrl?: string;
  readonly defaultModel: string;
  readonly fallbackModels: string[];
  fetchModels(apiKey?: string, baseUrl?: string): Promise<string[]>;
  create(config: CaptureConfig): CaptureProvider;
}

export const CAPTURE_REGISTRY = new Map<CaptureProviderName, CaptureProviderDescriptor>();
