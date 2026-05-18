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
exports.deriveProjectId = deriveProjectId;
exports.getTranscriptDir = getTranscriptDir;
exports.parseTranscriptFile = parseTranscriptFile;
exports.findUnprocessedSessions = findUnprocessedSessions;
exports.writeL0 = writeL0;
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
const readline_1 = require("readline");
function deriveProjectId(absoluteCwd) {
    return absoluteCwd.replace(/\//g, '-');
}
function getTranscriptDir(cwd) {
    return path.join(os.homedir(), '.claude', 'projects', deriveProjectId(cwd));
}
function stripCodeBlocks(text) {
    return text
        .replace(/```[^\n]*\n[\s\S]*?```/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function extractText(content) {
    if (typeof content === 'string')
        return content.trim();
    if (Array.isArray(content)) {
        return content
            .filter((c) => c?.type === 'text' && typeof c.text === 'string')
            .map((c) => c.text)
            .join('\n')
            .trim();
    }
    return '';
}
async function parseTranscriptFile(transcriptFile) {
    const turns = [];
    const rl = (0, readline_1.createInterface)({ input: (0, fs_1.createReadStream)(transcriptFile), crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim())
            continue;
        let obj;
        try {
            obj = JSON.parse(line);
        }
        catch {
            continue;
        }
        const type = obj['type'];
        if (type !== 'user' && type !== 'assistant')
            continue;
        if (obj['isMeta'] === true)
            continue;
        if (obj['toolUseResult'] === true)
            continue;
        const message = obj['message'];
        const content = message?.['content'];
        let text = extractText(content);
        if (type === 'assistant')
            text = stripCodeBlocks(text);
        if (text.length < 10)
            continue;
        turns.push({
            role: type,
            text,
            ts: obj['timestamp'] ?? new Date().toISOString(),
        });
    }
    return turns;
}
async function findUnprocessedSessions(cwd, processedIds) {
    const transcriptDir = getTranscriptDir(cwd);
    try {
        const entries = await fs.readdir(transcriptDir);
        return entries
            .filter((e) => e.endsWith('.jsonl'))
            .map((e) => ({ sessionId: e.replace('.jsonl', ''), file: path.join(transcriptDir, e) }))
            .filter(({ sessionId }) => !processedIds.includes(sessionId));
    }
    catch {
        return [];
    }
}
async function writeL0(l0Dir, sessionId, turns) {
    await fs.mkdir(l0Dir, { recursive: true });
    const l0File = path.join(l0Dir, `${sessionId}.jsonl`);
    const lines = turns.map((t) => JSON.stringify({ role: t.role, text: t.text, ts: t.ts }));
    await fs.writeFile(l0File, lines.join('\n') + '\n', 'utf-8');
}
//# sourceMappingURL=transcript-parser.js.map