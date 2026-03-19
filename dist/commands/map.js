"use strict";
/**
 * Map command
 * Print summary of the memory graph
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapCommand = mapCommand;
const store_1 = require("../core/store");
async function mapCommand(options = {}) {
    const cwd = process.cwd();
    const repoRoot = (0, store_1.findRepoRoot)(cwd, options.repo);
    let memories = (0, store_1.loadAll)(repoRoot);
    // Filter by type if specified
    if (options.type) {
        memories = memories.filter((m) => m.type === options.type);
    }
    if (memories.length === 0) {
        console.log('No memories found');
        return;
    }
    // Count by type
    const typeCounts = {
        lesson: 0,
        decision: 0,
        workflow: 0,
        architecture: 0,
    };
    memories.forEach((m) => {
        typeCounts[m.type]++;
    });
    // Count tags
    const tagCounts = {};
    memories.forEach((m) => {
        m.tags.forEach((tag) => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });
    // Sort tags by frequency
    const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    // Get recent memories
    const recentMemories = [...memories]
        .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
        .slice(0, 5);
    // Print summary
    console.log(`## Memory Map\n`);
    console.log(`**Total:** ${memories.length} memories\n`);
    console.log(`### By Type\n`);
    for (const [type, count] of Object.entries(typeCounts)) {
        if (count > 0) {
            console.log(`- ${type}: ${count}`);
        }
    }
    console.log();
    if (sortedTags.length > 0) {
        console.log(`### Top Tags\n`);
        for (const [tag, count] of sortedTags) {
            console.log(`- ${tag}: ${count}`);
        }
        console.log();
    }
    if (recentMemories.length > 0) {
        console.log(`### Recent Additions\n`);
        for (const memory of recentMemories) {
            const relativePath = memory.path.replace(repoRoot + '/', '');
            const date = memory.created.split('T')[0];
            console.log(`- [${memory.type}] ${memory.name} · ${date} (\`${relativePath}\`)`);
        }
    }
}
//# sourceMappingURL=map.js.map