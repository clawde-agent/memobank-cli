# Provider Descriptor Registry pattern for capability dispatch

We replaced the scattered if-else and switch chains that keyed on provider name strings with three `Map`-based registries — one per capability (Capture, Embedding, Reranker). Each registry entry is a self-describing Provider Descriptor that bundles all provider-specific metadata (label, `requiresApiKey`, `requiresBaseUrlStep`, default URL, default model) and the factory methods (`create`, `fetchModels`, optional `testConnection`). Callers do a single `registry.get(name)` lookup; adding a new provider means adding one descriptor entry, not modifying every dispatch site.

## Considered options

- **Keep if-else chains**: Zero migration cost, but every new provider touches 5+ files across 11 branch sites.
- **Class hierarchy**: Each provider is a class implementing an interface. Cleaner OOP, but requires instantiation discipline and makes the wizard data (labels, defaults) hard to separate from the factory logic.
- **Plugin registry with dynamic loading**: Maximum extensibility, but far beyond the current need — providers are built-in, not third-party plugins.

## Consequences

All three registries (`capture-registry.ts`, `reranker-registry.ts`, `embedding-registry.ts`) must be updated when a new provider is added, in addition to widening the Provider Name Union in `types.ts`. The union is the contract; the registry entries are the implementation.
