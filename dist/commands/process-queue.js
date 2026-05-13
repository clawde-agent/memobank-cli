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
exports.runProcessQueue = runProcessQueue;
exports.processQueueCommand = processQueueCommand;
const path = __importStar(require("path"));
const childProcess = __importStar(require("child_process"));
const store_1 = require("../core/store");
const queue_processor_1 = require("../core/queue-processor");
async function runProcessQueue(memoBankDir, options) {
    if (options.background) {
        const cliPath = path.join(__dirname, '..', 'cli.js');
        const child = childProcess.spawn(process.execPath, [cliPath, 'process-queue'], {
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
        return 0;
    }
    try {
        await (0, queue_processor_1.processQueue)(memoBankDir);
        return 0;
    }
    catch (err) {
        console.error(`process-queue failed: ${err.message}`);
        return 1;
    }
}
async function processQueueCommand(options = {}) {
    const repoRoot = (0, store_1.findRepoRoot)(process.cwd());
    const code = await runProcessQueue(repoRoot, { background: options.background ?? false });
    process.exitCode = code;
}
//# sourceMappingURL=process-queue.js.map