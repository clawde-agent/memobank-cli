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
exports.processQueue = processQueue;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const store_1 = require("./store");
const dedup_1 = require("./dedup");
async function processQueue(memoBankDir) {
    const pendingDir = path.join(memoBankDir, '.pending');
    if (!fs.existsSync(pendingDir)) {
        return;
    }
    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
        return;
    }
    const currentProjectId = (0, store_1.resolveProjectId)(memoBankDir);
    // Load all existing memories for dedup
    const existing = [];
    for (const type of ['lesson', 'decision', 'workflow', 'architecture']) {
        const typeDir = path.join(memoBankDir, type);
        if (!fs.existsSync(typeDir)) {
            continue;
        }
        for (const file of fs.readdirSync(typeDir).filter((f) => f.endsWith('.md'))) {
            try {
                existing.push((0, store_1.loadFile)(path.join(typeDir, file)));
            }
            catch {
                /* skip unreadable */
            }
        }
    }
    for (const file of files) {
        const filePath = path.join(pendingDir, file);
        let entry;
        try {
            entry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        catch {
            console.warn(`Skipping corrupt pending file: ${file}`);
            fs.unlinkSync(filePath);
            continue;
        }
        if (entry.projectId !== currentProjectId) {
            console.warn(`Deleted cross-project entry: ${entry.projectId} !== ${currentProjectId}`);
            fs.unlinkSync(filePath);
            continue;
        }
        const { toWrite } = await (0, dedup_1.deduplicate)(entry.candidates, existing);
        for (const candidate of toWrite) {
            const created = new Date().toISOString();
            // `created` is not in PendingCandidate — injected at write time
            (0, store_1.writeMemory)(memoBankDir, {
                ...candidate,
                created,
                project: entry.projectId,
            });
            // Add to existing so subsequent pending files see newly written memories
            existing.push({ ...candidate, path: '', created, status: 'experimental' });
        }
        fs.unlinkSync(filePath);
    }
}
//# sourceMappingURL=queue-processor.js.map