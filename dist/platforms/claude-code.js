"use strict";
/**
 * Claude Code platform install helper
 * Installs memobank hooks in ~/.claude/settings.json
 * Schema: https://www.schemastore.org/claude-code-settings.json
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
exports.installClaudeCode = installClaudeCode;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Get Claude Code settings path
 */
function getSettingsPath() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, '.claude', 'settings.json');
}
/**
 * Install memobank for Claude Code
 * @param enableAutoMemory - explicitly set autoMemoryEnabled in settings (true to enable, false to leave unchanged)
 */
function installClaudeCode(repoRoot, enableAutoMemory = true) {
    const settingsPath = getSettingsPath();
    const settingsDir = path.dirname(settingsPath);
    // Ensure .claude directory exists
    if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
    }
    // Read or create settings
    let settings = {};
    if (fs.existsSync(settingsPath)) {
        try {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            settings = JSON.parse(content);
        }
        catch (error) {
            console.warn(`Could not read Claude settings: ${error.message}`);
            return Promise.resolve(false);
        }
    }
    // Only set autoMemoryEnabled when the user explicitly agreed during setup.
    // If they chose to keep it off, leave the setting untouched.
    if (enableAutoMemory) {
        settings.autoMemoryEnabled = true;
    }
    // Remove any legacy memobank Stop hook before re-adding the current one.
    const hooks = settings.hooks;
    if (hooks?.Stop) {
        const stopHooks = hooks.Stop;
        const filtered = stopHooks.filter((h) => {
            // Check for legacy memo capture hooks
            if (h.hooks && h.hooks.length > 0) {
                return !h.hooks.some((cmd) => cmd.type === 'command' && cmd.command?.includes('memo capture'));
            }
            return true;
        });
        hooks.Stop = filtered;
        if (hooks.Stop.length === 0) {
            delete hooks.Stop;
        }
        if (Object.keys(hooks).length === 0) {
            delete settings.hooks;
        }
    }
    // Add process-queue Stop hook (merge, no duplicates)
    const STOP_HOOK = 'memo process-queue --background';
    if (!settings.hooks) {
        settings.hooks = {};
    }
    const hookMap = settings.hooks;
    const currentStop = hookMap.Stop ?? [];
    const hasStopHook = currentStop.some((h) => h.hooks?.some((cmd) => cmd.type === 'command' && cmd.command === STOP_HOOK));
    if (!hasStopHook) {
        hookMap.Stop = [
            ...currentStop,
            {
                matcher: '',
                hooks: [
                    {
                        type: 'command',
                        command: STOP_HOOK,
                        timeout: 5000,
                        async: true,
                        statusMessage: 'Saving memories...',
                    },
                ],
            },
        ];
    }
    // Write settings
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        console.log(`✓ Claude Code: memobank hooks installed`);
        return Promise.resolve(true);
    }
    catch (error) {
        console.error(`Could not write Claude settings: ${error.message}`);
        return Promise.resolve(false);
    }
}
//# sourceMappingURL=claude-code.js.map