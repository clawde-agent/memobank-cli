"use strict";
/**
 * Migration from legacy personal/ + team/ layout to three-tier model.
 * personal/ → globalDir (personal/global tier)
 * team/     → repoRoot flat (project tier)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrate = migrate;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const glob_1 = require("glob");
function migrate(repoRoot, globalDir, options) {
    const result = { personalMoves: [], teamMoves: [], conflicts: [] };
    const personalDir = path.join(repoRoot, 'personal');
    const teamDir = path.join(repoRoot, 'team');
    const personalBak = path.join(repoRoot, 'personal.bak');
    const teamBak = path.join(repoRoot, 'team.bak');
    if (options.rollback) {
        if (fs.existsSync(personalBak)) {
            fs.renameSync(personalBak, personalDir);
            console.log('✓ Restored personal/ from backup.');
        }
        if (fs.existsSync(teamBak)) {
            fs.renameSync(teamBak, teamDir);
            console.log('✓ Restored team/ from backup.');
        }
        return result;
    }
    // Collect personal/ moves
    if (fs.existsSync(personalDir)) {
        const files = glob_1.glob.sync(path.join(personalDir, '**', '*.md').split(path.sep).join('/'));
        for (const srcFile of files) {
            const rel = path.relative(personalDir, srcFile);
            const dst = path.join(globalDir, rel);
            result.personalMoves.push({ from: srcFile, to: dst });
        }
    }
    // Collect team/ moves
    if (fs.existsSync(teamDir)) {
        const files = glob_1.glob.sync(path.join(teamDir, '**', '*.md').split(path.sep).join('/'));
        for (const srcFile of files) {
            const rel = path.relative(teamDir, srcFile);
            const dst = path.join(repoRoot, rel);
            if (fs.existsSync(dst)) {
                result.conflicts.push(srcFile);
            }
            else {
                result.teamMoves.push({ from: srcFile, to: dst });
            }
        }
    }
    if (options.dryRun) {
        console.log(`Dry run — no changes made.`);
        console.log(`Personal moves: ${result.personalMoves.length}`);
        console.log(`Team moves: ${result.teamMoves.length}`);
        console.log(`Conflicts: ${result.conflicts.length}`);
        return result;
    }
    // Execute personal moves
    for (const { from, to } of result.personalMoves) {
        if (fs.existsSync(to)) {
            continue;
        } // idempotent skip
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        console.log(`  personal → global: ${path.basename(from)}`);
    }
    // Execute team moves
    for (const { from, to } of result.teamMoves) {
        if (fs.existsSync(to)) {
            continue;
        }
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        console.log(`  team → project: ${path.basename(from)}`);
    }
    // Backup originals
    if (fs.existsSync(personalDir) && !fs.existsSync(personalBak)) {
        fs.renameSync(personalDir, personalBak);
        console.log('✓ personal/ backed up to personal.bak/');
    }
    if (fs.existsSync(teamDir) && !fs.existsSync(teamBak)) {
        fs.renameSync(teamDir, teamBak);
        console.log('✓ team/ backed up to team.bak/');
    }
    if (result.conflicts.length > 0) {
        console.warn(`\n⚠️  ${result.conflicts.length} conflicts — saved as <name>.bak.md:`);
        for (const f of result.conflicts) {
            const bak = f + '.bak.md';
            fs.copyFileSync(f, bak);
            console.warn(`  ${path.basename(f)} → ${path.basename(bak)}`);
        }
    }
    console.log('\n✓ Migration complete. Review changes and run: git add .memobank');
    return result;
}
//# sourceMappingURL=migrate.js.map