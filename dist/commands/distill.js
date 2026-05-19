"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.distillCommand = distillCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const store_1 = require("../core/store");
const config_1 = require("../config");
const distiller_1 = require("../core/distiller");
const scene_synthesizer_1 = require("../core/scene-synthesizer");
const scene_index_1 = require("../core/scene-index");
const scene_navigation_1 = require("../core/scene-navigation");
function log(msg, silent) {
    if (!silent)
        process.stdout.write(msg + '\n');
}
function writeDistilledMemory(dir, name, frontmatter, content) {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${name}.md`);
    const fileContent = gray_matter_1.default.stringify(content, frontmatter);
    fs.writeFileSync(filePath, fileContent, 'utf-8');
}
async function distillCommand(options) {
    const repoRoot = (0, store_1.findRepoRoot)(process.cwd(), options.repo);
    const config = (0, config_1.loadConfig)(repoRoot);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        log('No ANTHROPIC_API_KEY configured. Skipping distillation.', options.silent);
        return;
    }
    if (options.to === 'workspace') {
        const all = (0, store_1.loadAll)(repoRoot, 'project');
        const eligible = all.filter((m) => m.confidence === 'high' && (m.status === 'active' || !m.status));
        if (eligible.length === 0) {
            log('No high-confidence active memories to distill.', options.silent);
            return;
        }
        log(`Distilling ${eligible.length} memories to workspace tier...`, options.silent);
        const distilled = await (0, distiller_1.distillToWorkspace)(eligible, apiKey);
        if (distilled.length === 0) {
            log('LLM returned no distilled memories.', options.silent);
            return;
        }
        const workspaceName = config.project.name;
        const workspaceDir = (0, store_1.getWorkspaceDir)(workspaceName);
        // Load existing workspace memories for idempotency: match by distilled_from
        const existingMap = new Map(); // source name → target filename
        if (fs.existsSync(workspaceDir)) {
            for (const f of fs.readdirSync(workspaceDir, { recursive: true })) {
                if (!f.endsWith('.md'))
                    continue;
                const fullPath = path.join(workspaceDir, f);
                try {
                    const raw = fs.readFileSync(fullPath, 'utf-8');
                    const parsed = (0, gray_matter_1.default)(raw);
                    const sources = parsed.data.distilled_from;
                    if (sources) {
                        for (const src of sources)
                            existingMap.set(src, path.basename(f, '.md'));
                    }
                }
                catch {
                    /* skip unreadable files */
                }
            }
        }
        for (const d of distilled) {
            // Idempotency: reuse existing name if any source already has a workspace version
            const existingName = d.distilled_from.map((s) => existingMap.get(s)).find(Boolean);
            const targetName = existingName ?? d.name;
            const targetDir = path.join(workspaceDir, d.type);
            writeDistilledMemory(targetDir, targetName, {
                name: targetName,
                type: d.type,
                description: d.description,
                tags: d.tags,
                confidence: d.confidence,
                distilled_from: d.distilled_from,
                status: 'active',
                updated: new Date().toISOString().slice(0, 10),
            }, d.content);
        }
        log(`Distilled ${distilled.length} memories to workspace: ${workspaceDir}`, options.silent);
    }
    else if (options.to === 'personal') {
        // --to personal
        const projectId = (0, store_1.resolveProjectId)(repoRoot);
        const personalDir = (0, store_1.getGlobalDir)(projectId);
        const personaPath = path.join(personalDir, 'persona.md');
        const existingPersona = fs.existsSync(personaPath)
            ? fs.readFileSync(personaPath, 'utf-8')
            : undefined;
        const all = (0, store_1.loadAll)(repoRoot, 'all', (0, store_1.getGlobalDir)(projectId), config.workspace ? (0, store_1.getWorkspaceDir)(config.project.name) : undefined);
        if (all.length === 0) {
            log('No memories found for persona synthesis.', options.silent);
            return;
        }
        log(`Synthesizing persona from ${all.length} memories...`, options.silent);
        const persona = await (0, distiller_1.distillToPersonal)(all, existingPersona, apiKey);
        if (!persona) {
            log('LLM returned empty persona.', options.silent);
            return;
        }
        fs.mkdirSync(personalDir, { recursive: true });
        fs.writeFileSync(personaPath, persona, 'utf-8');
        log(`Persona written to ${personaPath}`, options.silent);
    }
    else if (options.to === 'scenes') {
        const all = (0, store_1.loadAll)(repoRoot, 'project');
        if (all.length === 0) {
            log('No memories found for scene synthesis.', options.silent);
            return;
        }
        log(`Synthesizing scenes from ${all.length} memories...`, options.silent);
        const results = await (0, scene_synthesizer_1.synthesizeScenes)(all, repoRoot, apiKey);
        if (results.length === 0) {
            log('No scenes produced.', options.silent);
            return;
        }
        log(`Created/updated ${results.length} scene(s).`, options.silent);
        if (!options.silent) {
            const index = await (0, scene_index_1.readSceneIndex)(repoRoot);
            const nav = (0, scene_navigation_1.generateSceneNavigation)(repoRoot, index);
            if (nav)
                process.stdout.write('\n' + nav + '\n');
        }
    }
}
//# sourceMappingURL=distill.js.map