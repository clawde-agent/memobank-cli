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
const lifecycle_manager_1 = require("./lifecycle-manager");
function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Recall memories for a query
 */
async function recall(query, repoRoot, config, engine, scope = 'all', explain = false) {
    const memories = (0, store_1.loadAll)(repoRoot, scope);
    const searchEngine = engine || new text_engine_1.TextEngine();
    let results = await searchEngine.search(query, memories, config.memory.top_k);
    for (const result of results) {
        (0, lifecycle_manager_1.recordAccess)(repoRoot, result.memory.path, query);
    }
    if (explain && results.length > 0 && results.every(r => !r.scoreBreakdown)) {
        console.warn('--explain: score breakdown not available for the current engine.');
    }
    let markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length, scope, explain);
    let tokenCount = estimateTokenCount(markdown);
    if (tokenCount > config.memory.token_budget) {
        while (results.length > 0 && tokenCount > config.memory.token_budget) {
            results.pop();
            markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length, scope, explain);
            tokenCount = estimateTokenCount(markdown);
        }
    }
    return { results, markdown };
}
function scopeLabel(scope) {
    if (scope === 'team') {
        return '👥 team';
    }
    if (scope === 'personal') {
        return '👤 personal';
    }
    return '';
}
/**
 * Format recall results as markdown for MEMORY.md
 */
function formatResultsAsMarkdown(results, query, engine, totalMemories, scope = 'all', explain = false) {
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
            // Show scope label only when results come from both sources
            const showScope = scope === 'all' && memory.scope !== undefined;
            const sourcePart = showScope ? ` | ${scopeLabel(memory.scope)}` : '';
            markdown += `### [score: ${score.toFixed(2)}${sourcePart}] ${memory.name}${confidenceStr}\n`;
            if (explain && result.scoreBreakdown) {
                const b = result.scoreBreakdown;
                const parts = [`keyword(${b.keyword.toFixed(2)})`, `tags(${b.tags.toFixed(2)})`, `recency(${b.recency.toFixed(2)})`];
                markdown += `  matched: ${parts.join(' + ')}\n`;
            }
            markdown += `> ${memory.description}\n`;
            markdown += `> \`${relativePath}\`${tagStr}\n\n`;
        }
        markdown += `---\n*To flag a result: memo correct <file> --reason "not relevant"*\n\n`;
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