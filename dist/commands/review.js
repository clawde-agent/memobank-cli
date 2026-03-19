"use strict";
/**
 * Review command
 * List memories due for review
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewCommand = reviewCommand;
const store_1 = require("../core/store");
const decay_engine_1 = require("../core/decay-engine");
async function reviewCommand(options = {}) {
    const cwd = process.cwd();
    const repoRoot = (0, store_1.findRepoRoot)(cwd, options.repo);
    const memories = (0, store_1.loadAll)(repoRoot);
    const now = new Date();
    const dueMemories = memories.filter((m) => (0, decay_engine_1.isReviewDue)(m, now));
    if (options.due) {
        // Show only overdue items
        if (dueMemories.length === 0) {
            console.log('No memories due for review');
        }
        else {
            console.log(`## ${dueMemories.length} memories due for review\n`);
            for (const memory of dueMemories) {
                const relativePath = memory.path.replace(repoRoot + '/', '');
                console.log(`### [${memory.type}] ${memory.name}`);
                console.log(`> ${memory.description}`);
                console.log(`> \`${relativePath}\` · created: ${memory.created.split('T')[0]}`);
                console.log();
            }
        }
    }
    else {
        // Show all with review schedule
        const withReview = memories.filter((m) => m.review_after);
        const withoutReview = memories.filter((m) => !m.review_after);
        console.log(`## Review Status\n`);
        console.log(`Total memories: ${memories.length}`);
        console.log(`Due for review: ${dueMemories.length}`);
        console.log(`With review schedule: ${withReview.length}`);
        console.log(`Without review schedule: ${withoutReview.length}\n`);
        if (dueMemories.length > 0) {
            console.log(`### Due for Review (${dueMemories.length})\n`);
            for (const memory of dueMemories) {
                const relativePath = memory.path.replace(repoRoot + '/', '');
                console.log(`- [${memory.type}] ${memory.name} (\`${relativePath}\`)`);
            }
            console.log();
        }
        if (withReview.length > dueMemories.length) {
            const upcoming = withReview.filter((m) => !(0, decay_engine_1.isReviewDue)(m, now));
            console.log(`### Upcoming Reviews (${upcoming.length})\n`);
            for (const memory of upcoming.slice(0, 10)) {
                const relativePath = memory.path.replace(repoRoot + '/', '');
                console.log(`- [${memory.type}] ${memory.name} (\`${relativePath}\`) · review: ${memory.review_after}`);
            }
            if (upcoming.length > 10) {
                console.log(`... and ${upcoming.length - 10} more`);
            }
        }
    }
    if (options.format === 'json') {
        const output = options.due ? dueMemories : memories;
        console.log(JSON.stringify(output, null, 2));
    }
}
//# sourceMappingURL=review.js.map