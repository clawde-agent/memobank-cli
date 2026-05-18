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
exports.readSceneIndex = readSceneIndex;
exports.writeSceneIndex = writeSceneIndex;
exports.updateSceneHeat = updateSceneHeat;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const INDEX_PATH = '.metadata/scene_index.json';
async function readSceneIndex(memoDir) {
    const indexPath = path.join(memoDir, INDEX_PATH);
    try {
        const raw = await fs.readFile(indexPath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            throw err;
        return [];
    }
}
async function writeSceneIndex(memoDir, entries) {
    const indexPath = path.join(memoDir, INDEX_PATH);
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, JSON.stringify(entries, null, 2), 'utf-8');
}
async function updateSceneHeat(memoDir, filename) {
    const entries = await readSceneIndex(memoDir);
    const entry = entries.find((e) => e.filename === filename);
    if (!entry)
        return;
    entry.heat += 1;
    entry.updated = new Date().toISOString().slice(0, 10);
    await writeSceneIndex(memoDir, entries);
}
//# sourceMappingURL=scene-index.js.map