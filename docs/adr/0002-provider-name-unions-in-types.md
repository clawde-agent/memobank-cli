# All Provider Name Unions live in types.ts

`CaptureProviderName`, `EmbeddingProvider`, and `RerankerProvider` are all defined in `src/types.ts`, not in their respective registry or capability modules (`embedding.ts`, `reranker.ts`). This makes `types.ts` the single authoritative extension point: adding a new provider requires exactly one union edit there, and the TypeScript compiler enforces exhaustiveness everywhere else.

`EmbeddingProvider` was originally defined in `src/core/embedding.ts` and `RerankerProvider` in `src/core/reranker.ts`. Both were moved to `types.ts` to break a circular import that would have arisen when `embedding.ts` needed to import `EMBEDDING_REGISTRY` (which imports `EmbeddingProvider` from `embedding.ts`). Consolidation resolved the cycle and made all three unions consistent.
