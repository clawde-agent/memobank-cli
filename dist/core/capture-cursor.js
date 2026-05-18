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
exports.readCursor = readCursor;
exports.markSessionProcessed = markSessionProcessed;
exports.isSessionProcessed = isSessionProcessed;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const MAX_SESSIONS = 100;
async function readCursor(metaDir) {
    const cursorPath = path.join(metaDir, 'capture-cursor.json');
    try {
        const raw = await fs.readFile(cursorPath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            throw err;
        return { processedSessions: [] };
    }
}
async function markSessionProcessed(metaDir, sessionId) {
    const cursorPath = path.join(metaDir, 'capture-cursor.json');
    const cursor = await readCursor(metaDir);
    if (cursor.processedSessions.includes(sessionId))
        return;
    cursor.processedSessions.push(sessionId);
    if (cursor.processedSessions.length > MAX_SESSIONS) {
        cursor.processedSessions = cursor.processedSessions.slice(-MAX_SESSIONS);
    }
    await fs.mkdir(path.dirname(cursorPath), { recursive: true });
    await fs.writeFile(cursorPath, JSON.stringify(cursor, null, 2), 'utf-8');
}
async function isSessionProcessed(metaDir, sessionId) {
    const cursor = await readCursor(metaDir);
    return cursor.processedSessions.includes(sessionId);
}
//# sourceMappingURL=capture-cursor.js.map