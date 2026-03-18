"use strict";
/**
 * Retriever module
 * Orchestrates engine search and formats output for MEMORY.md injection
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recall = recall;
exports.writeRecallResults = writeRecallResults;
const store_1 = require("./store");
const text_engine_1 = require("../engines/text-engine");
// Simple token estimation (rough approximation: ~4 chars per token)
function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Recall memories for a query
 * Returns both the results and formatted markdown
 */
async function recall(query, repoRoot, config, engine) {
    // Load all memories
    const memories = (0, store_1.loadAll)(repoRoot);
    // Use provided engine or default to text engine
    const searchEngine = engine || new text_engine_1.TextEngine();
    // Run search
    let results = await searchEngine.search(query, memories, config.memory.top_k);
    // Truncate if over token budget
    let markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length);
    let tokenCount = estimateTokenCount(markdown);
    if (tokenCount > config.memory.token_budget) {
        // Remove results until under budget
        while (results.length > 0 && tokenCount > config.memory.token_budget) {
            results.pop();
            markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length);
            tokenCount = estimateTokenCount(markdown);
        }
    }
    return { results, markdown };
}
/**
 * Format recall results as markdown for MEMORY.md
 */
function formatResultsAsMarkdown(results, query, engine, totalMemories) {
    let markdown = `<!-- Last updated: ${new Date().toISOString()} | query: "${query}" | engine: ${engine} | top ${results.length} of ${totalMemories} -->\n\n`;
    markdown += `## Recalled Memory\n\n`;
    if (results.length === 0) {
        markdown += `*No memories found for "${query}"*\n`;
    }
    else {
        for (const result of results) {
            const { memory, score } = result;
            const confidenceStr = memory.confidence ? ` · ${memory.confidence} confidence` : '';
            const tagStr = memory.tags.length > 0 ? ` · tags: ${memory.tags.join(', ')}` : '';
            const relativePath = memory.path.replace(/^.*\/memobank\//, '');
            markdown += `### [${memory.type}] ${memory.name}${confidenceStr}\n`;
            markdown += `> ${memory.description}\n`;
            markdown += `> \`${relativePath}\`${tagStr}\n\n`;
        }
    }
    const tokenCount = estimateTokenCount(markdown);
    markdown += `---\n`;
    markdown += `*${results.length} of ${totalMemories} memories · engine: ${engine} · ~${tokenCount} tokens*`;
    return markdown;
}
/**
 * Write recall results to MEMORY.md
 */
function writeRecallResults(repoRoot, results, query, engine) {
    (0, store_1.writeMemoryMd)(repoRoot, results, query, engine);
}
//# sourceMappingURL=retriever.js.map