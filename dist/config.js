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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LIFECYCLE = void 0;
exports.loadConfig = loadConfig;
exports.writeConfig = writeConfig;
exports.initConfig = initConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const DEFAULT_LIFECYCLE = {
    experimental_ttl_days: 30,
    active_to_review_days: 90,
    review_to_deprecated_days: 90,
    review_recall_threshold: 3,
    decay_window_days: 180,
};
exports.DEFAULT_LIFECYCLE = DEFAULT_LIFECYCLE;
const DEFAULT_CONFIG = {
    project: { name: 'default', description: '' },
    memory: { token_budget: 2000, top_k: 5 },
    embedding: {
        engine: 'text',
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        base_url: undefined,
    },
    search: { use_tags: true, use_summary: true },
    review: { enabled: true },
    lifecycle: { ...DEFAULT_LIFECYCLE },
};
function getConfigPath(repoRoot) {
    return path.join(repoRoot, 'meta', 'config.yaml');
}
function loadConfig(repoRoot) {
    const configPath = getConfigPath(repoRoot);
    if (!fs.existsSync(configPath)) {
        return { ...DEFAULT_CONFIG };
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const loaded = yaml.load(content);
        // Alias team: → workspace: for backward compat
        if (loaded?.team && !loaded?.workspace) {
            loaded.workspace = loaded.team;
            delete loaded.team;
        }
        return {
            project: { ...DEFAULT_CONFIG.project, ...loaded?.project },
            memory: { ...DEFAULT_CONFIG.memory, ...loaded?.memory },
            embedding: { ...DEFAULT_CONFIG.embedding, ...loaded?.embedding },
            search: { ...DEFAULT_CONFIG.search, ...loaded?.search },
            review: { ...DEFAULT_CONFIG.review, ...loaded?.review },
            lifecycle: { ...DEFAULT_LIFECYCLE, ...loaded?.lifecycle },
            ...(loaded?.workspace ? { workspace: loaded.workspace } : {}),
            ...(loaded?.reranker ? { reranker: loaded.reranker } : {}),
        };
    }
    catch (error) {
        console.warn(`Could not load config: ${error.message}`);
        return { ...DEFAULT_CONFIG };
    }
}
function writeConfig(repoRoot, config) {
    const configPath = getConfigPath(repoRoot);
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    try {
        const content = yaml.dump(config, { indent: 2 });
        fs.writeFileSync(configPath, content, 'utf-8');
    }
    catch (error) {
        throw new Error(`Could not write config: ${error.message}`);
    }
}
function initConfig(repoRoot, projectName) {
    writeConfig(repoRoot, { ...DEFAULT_CONFIG, project: { name: projectName } });
}
//# sourceMappingURL=config.js.map