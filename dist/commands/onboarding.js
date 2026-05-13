"use strict";
/**
 * Onboarding command (memo init)
 * 4-step interactive TUI setup wizard using Ink
 *
 * ink, ink-text-input, and ink-select-input are ESM-only packages that cannot be
 * require()'d from a CommonJS bundle. All imports of those packages are done via
 * a Function-constructor-based dynamic import() so TypeScript does not rewrite
 * them to require() calls.
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
exports.onboardingCommand = onboardingCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const store_1 = require("../core/store");
const config_1 = require("../config");
const claude_code_1 = require("../platforms/claude-code");
const codex_1 = require("../platforms/codex");
const gemini_1 = require("../platforms/gemini");
const qwen_1 = require("../platforms/qwen");
const cursor_1 = require("../platforms/cursor");
const workspace_1 = require("./workspace");
/** Test Ollama connectivity and model availability */
async function testOllamaConnection(baseUrl, model) {
    try {
        const url = baseUrl.replace(/\/$/, '');
        const res = await fetch(`${url}/api/tags`);
        if (!res.ok)
            return `Ollama returned HTTP ${res.status}`;
        const data = await res.json();
        const models = data.models?.map((m) => m.name) ?? [];
        const found = models.some((n) => n === model || n.startsWith(`${model}:`));
        if (!found) {
            return `Model "${model}" not found — run: ollama pull ${model}`;
        }
        return null; // success
    }
    catch {
        return `Cannot reach Ollama at ${baseUrl} — run: ollama serve`;
    }
}
/** Detect git repo name from cwd */
function detectProjectName() {
    try {
        const result = (0, child_process_1.execSync)('git rev-parse --show-toplevel', {
            encoding: 'utf-8', stdio: 'pipe',
        }).trim();
        return path.basename(result);
    }
    catch {
        return path.basename(process.cwd());
    }
}
/** Check if Claude Code has auto-memory explicitly disabled */
function isAutoMemoryDisabled() {
    const settingsPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath)) {
        return false;
    }
    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        return settings.autoMemoryEnabled === false;
    }
    catch {
        return false;
    }
}
/** Detect which platforms are installed */
function detectPlatforms() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const isInPath = (cmd) => {
        try {
            (0, child_process_1.execSync)(`which ${cmd}`, { stdio: 'pipe' });
            return true;
        }
        catch {
            return false;
        }
    };
    return [
        {
            label: 'Claude Code',
            value: 'claude-code',
            hint: fs.existsSync(path.join(home, '.claude', 'settings.json')) ? '✓ detected' : 'not found',
            disabled: false,
        },
        {
            label: 'Codex',
            value: 'codex',
            hint: isInPath('codex') ? '✓ detected' : 'not found',
        },
        {
            label: 'Gemini CLI',
            value: 'gemini',
            hint: (0, gemini_1.detectGemini)() ? '✓ detected' : 'not found',
        },
        {
            label: 'Qwen Code',
            value: 'qwen',
            hint: (0, qwen_1.detectQwen)() ? '✓ detected' : 'not found',
        },
        {
            label: 'Cursor',
            value: 'cursor',
            hint: fs.existsSync(path.join(process.cwd(), '.cursor')) ? '✓ detected' : 'not found',
        },
    ];
}
/** Get default-selected platform values (detected ones) */
function getDetectedPlatforms(items) {
    return items.filter(i => i.hint?.includes('✓')).map(i => i.value);
}
async function runSetup(state, gitRoot) {
    const repoRoot = path.join(gitRoot, state.projectDir);
    const summaryLines = [];
    let autoMemoryWarning = false;
    // 1. Init config
    (0, config_1.initConfig)(repoRoot, state.projectName);
    // 2. Create directory structure
    const TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
    for (const type of TYPES) {
        fs.mkdirSync(path.join(repoRoot, type), { recursive: true });
    }
    summaryLines.push(`Memories: ${repoRoot}`);
    // 3. Initialize workspace remote if provided
    if (state.workspaceRemote.trim()) {
        try {
            await (0, workspace_1.workspaceInit)(state.workspaceRemote.trim(), repoRoot);
            summaryLines.push(`Workspace: ${state.workspaceRemote.trim()}`);
        }
        catch (err) {
            summaryLines.push(`⚠  Workspace init failed: ${err.message}`);
        }
    }
    // 4. Install platform adapters
    for (const platform of state.platforms) {
        switch (platform) {
            case 'claude-code':
                await (0, claude_code_1.installClaudeCode)(repoRoot, state.enableAutoMemory);
                if (!state.enableAutoMemory) {
                    autoMemoryWarning = true;
                }
                break;
            case 'codex':
                await (0, codex_1.installCodex)(process.cwd());
                break;
            case 'gemini':
                await (0, gemini_1.installGemini)();
                break;
            case 'qwen':
                await (0, qwen_1.installQwen)();
                break;
            case 'cursor':
                await (0, cursor_1.installCursor)(process.cwd());
                break;
        }
    }
    if (state.platforms.length > 0) {
        summaryLines.push(`Platforms: ${state.platforms.join(', ')}`);
    }
    // 6. Update engine config if lancedb
    if (state.searchEngine === 'lancedb') {
        const config = (0, config_1.loadConfig)(repoRoot);
        config.embedding.engine = 'lancedb';
        if (state.embeddingProvider === 'ollama') {
            const ollamaUrl = state.embeddingUrl || 'http://localhost:11434';
            const ollamaModel = state.embeddingModel || 'mxbai-embed-large';
            config.embedding.provider = 'ollama';
            config.embedding.base_url = ollamaUrl;
            config.embedding.model = ollamaModel;
            config.embedding.dimensions = 1024;
            // Test connectivity
            const ollamaErr = await testOllamaConnection(ollamaUrl, ollamaModel);
            if (ollamaErr) {
                summaryLines.push(`⚠  Ollama: ${ollamaErr}`);
            }
            else {
                summaryLines.push(`✓ Ollama connected, model "${ollamaModel}" ready`);
            }
        }
        else if (state.embeddingProvider === 'openai') {
            config.embedding.provider = 'openai';
            config.embedding.model = 'text-embedding-3-small';
            config.embedding.dimensions = 1536;
            // Save API key to env file (not config.yaml for security)
            if (state.embeddingApiKey.trim()) {
                const envPath = path.join(repoRoot, '.env');
                const envLine = `OPENAI_API_KEY=${state.embeddingApiKey.trim()}\n`;
                const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
                if (!existing.includes('OPENAI_API_KEY=')) {
                    fs.writeFileSync(envPath, existing + envLine, 'utf-8');
                    summaryLines.push(`OpenAI API key saved to ${envPath}`);
                }
            }
        }
        else if (state.embeddingProvider === 'jina') {
            config.embedding.provider = 'jina';
            config.embedding.model = 'jina-embeddings-v3';
            config.embedding.dimensions = 1024;
            if (state.embeddingApiKey.trim()) {
                const envPath = path.join(repoRoot, '.env');
                const envLine = `JINA_API_KEY=${state.embeddingApiKey.trim()}\n`;
                const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
                if (!existing.includes('JINA_API_KEY=')) {
                    fs.writeFileSync(envPath, existing + envLine, 'utf-8');
                    summaryLines.push(`Jina API key saved to ${envPath}`);
                }
            }
        }
        (0, config_1.writeConfig)(repoRoot, config);
    }
    if (state.enableReranker && state.rerankerProvider) {
        const config = (0, config_1.loadConfig)(repoRoot);
        config.reranker = {
            enabled: true,
            provider: state.rerankerProvider,
        };
        (0, config_1.writeConfig)(repoRoot, config);
        const keyVar = state.rerankerProvider === 'jina' ? 'JINA_API_KEY' : 'COHERE_API_KEY';
        summaryLines.push(`Reranker: ${state.rerankerProvider} (set ${keyVar} env var)`);
    }
    return { lines: summaryLines, autoMemoryWarning };
}
async function onboardingCommand() {
    const gitRoot = (0, store_1.findGitRoot)(process.cwd());
    // Use Function constructor to bypass TypeScript's import() -> require() transform.
    // ink, ink-text-input, ink-select-input are ESM-only packages that cannot be
    // require()'d from a CommonJS bundle; this ensures Node uses its ESM loader.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const esmImport = new Function('specifier', 'return import(specifier)');
    const reactMod = await esmImport('react');
    const React = (reactMod.default ?? reactMod);
    const { useState, useRef } = React;
    const inkMod = await esmImport('ink');
    const { render, Box, Text, useInput } = inkMod;
    const inkTextInputMod = await esmImport('ink-text-input');
    const TextInput = inkTextInputMod.default;
    const inkSelectInputMod = await esmImport('ink-select-input');
    const SelectInput = inkSelectInputMod.default;
    const defaultName = detectProjectName();
    const platformItems = detectPlatforms();
    const detectedPlatforms = getDetectedPlatforms(platformItems);
    const searchEngineItems = [
        { label: 'Text (recommended, zero setup)', value: 'text' },
        { label: 'Vector / LanceDB (better recall, requires Ollama or OpenAI)', value: 'lancedb' },
    ];
    function InlineMultiSelect({ label, items, defaultSelected = [], onSubmit }) {
        const [cursor, setCursor] = useState(0);
        const [selected, setSelected] = useState(new Set(defaultSelected));
        useInput((input, key) => {
            if (key.upArrow) {
                setCursor(c => Math.max(0, c - 1));
            }
            if (key.downArrow) {
                setCursor(c => Math.min(items.length - 1, c + 1));
            }
            if (input === ' ') {
                const item = items[cursor];
                if (item && !item.disabled) {
                    setSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(item.value)) {
                            next.delete(item.value);
                        }
                        else {
                            next.add(item.value);
                        }
                        return next;
                    });
                }
            }
            if (key.return) {
                setSelected(prev => { onSubmit([...prev]); return prev; });
            }
        });
        return React.createElement(Box, { flexDirection: 'column', marginBottom: 1 }, React.createElement(Text, { bold: true }, label), React.createElement(Text, { dimColor: true }, '  (↑↓ navigate · Space toggle · Enter confirm)'), ...items.map((item, i) => React.createElement(Box, { key: item.value }, React.createElement(Text, { color: (i === cursor ? 'cyan' : undefined) }, `  ${selected.has(item.value) ? '◉' : '◯'} ${item.label}`, item.hint ? React.createElement(Text, { dimColor: true }, `  ${item.hint}`) : null))));
    }
    function OnboardingApp() {
        const [state, setState] = useState({
            step: 'project-name',
            projectName: defaultName,
            projectDir: '.memobank',
            platforms: detectedPlatforms,
            enableAutoMemory: true,
            workspaceRemote: '',
            searchEngine: 'text',
            embeddingProvider: '',
            embeddingUrl: 'http://localhost:11434',
            embeddingModel: 'mxbai-embed-large',
            embeddingApiKey: '',
            enableReranker: false,
            rerankerProvider: '',
        });
        const [nameInput, setNameInput] = useState(defaultName);
        const [projectDirInput, setProjectDirInput] = useState('.memobank');
        const [workspaceInput, setWorkspaceInput] = useState('');
        const [ollamaUrlInput, setOllamaUrlInput] = useState('http://localhost:11434');
        const [ollamaModelInput, setOllamaModelInput] = useState('mxbai-embed-large');
        const [openaiKeyInput, setOpenaiKeyInput] = useState('');
        const [jinaKeyInput, setJinaKeyInput] = useState('');
        const [done, setDone] = useState(false);
        const [summary, setSummary] = useState([]);
        const [autoMemoryWarning, setAutoMemoryWarning] = useState(false);
        // Prevent double-submission
        const setupRunning = useRef(false);
        if (done) {
            return React.createElement(Box, { flexDirection: 'column', marginTop: 1 }, React.createElement(Text, { color: 'green', bold: true }, '✓ memobank initialized!'), ...summary.map((line, i) => React.createElement(Text, { key: i, dimColor: true }, `  ${line}`)), React.createElement(Text, { dimColor: true }, 'Run: memo recall "anything" to test'), autoMemoryWarning
                ? React.createElement(Box, { flexDirection: 'column', marginTop: 1 }, React.createElement(Text, { color: 'yellow', bold: true }, '⚠  Auto-memory is off'), React.createElement(Text, { color: 'yellow' }, '   Claude Code won\'t read or write project memories in .memobank/'), React.createElement(Text, { dimColor: true }, '   To enable later: set "autoMemoryEnabled": true in ~/.claude/settings.json'))
                : null);
        }
        return React.createElement(Box, { flexDirection: 'column', padding: 1 }, React.createElement(Text, { bold: true, color: 'cyan' }, '🧠  Memobank Setup'), React.createElement(Text, null, ' '), state.step === 'project-name' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, null, 'Project name:'), React.createElement(TextInput, {
            value: nameInput,
            onChange: setNameInput,
            onSubmit: (value) => {
                setState(s => ({ ...s, step: 'project-dir', projectName: value || defaultName }));
            },
        })) : null, state.step === 'project-dir' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, { bold: true }, 'Project memory directory'), React.createElement(Text, { dimColor: true }, `  Folder inside ${gitRoot}/ that stores your project memories`), React.createElement(Text, { dimColor: true }, '  Default is .memobank — press Enter to confirm, or type a custom name:'), React.createElement(TextInput, {
            value: projectDirInput,
            onChange: setProjectDirInput,
            onSubmit: (value) => {
                const dir = (value || '.memobank').replace(/^\/+|\/+$/g, '');
                setState(s => ({ ...s, step: 'platforms', projectDir: dir }));
            },
        })) : null, state.step === 'platforms' ? React.createElement(InlineMultiSelect, {
            label: 'Select platforms to integrate:',
            items: platformItems,
            defaultSelected: detectedPlatforms,
            onSubmit: (selected) => {
                const needsAutoMemoryCheck = selected.includes('claude-code') && isAutoMemoryDisabled();
                setState(s => ({
                    ...s,
                    platforms: selected,
                    step: needsAutoMemoryCheck ? 'auto-memory-check' : 'workspace-remote',
                }));
            },
        }) : null, state.step === 'auto-memory-check' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, { bold: true, color: 'yellow' }, '⚠  Claude Code auto-memory is disabled'), React.createElement(Text, null, ' '), React.createElement(Text, null, 'memobank stores project memories in .memobank/ and relies on Claude Code\'s'), React.createElement(Text, null, 'auto-memory to load them at session start and save new ones automatically.'), React.createElement(Text, null, 'With auto-memory off, Claude Code won\'t read or write to .memobank/.'), React.createElement(Text, null, ' '), React.createElement(Text, { bold: true }, 'Enable auto-memory for this project?'), React.createElement(SelectInput, {
            items: [
                { label: 'Yes — enable auto-memory (recommended)', value: 'yes' },
                { label: 'No — keep it off', value: 'no' },
            ],
            onSelect: (item) => {
                const enable = String(item.value) === 'yes';
                setState(s => ({ ...s, enableAutoMemory: enable, step: 'workspace-remote' }));
            },
        })) : null, state.step === 'workspace-remote' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, { bold: true }, 'Workspace remote'), React.createElement(Text, { dimColor: true }, '  Org-wide memories shared across repos (e.g. git@github.com:myorg/platform-docs.git)'), React.createElement(Text, { dimColor: true }, '  Optional — press Enter to skip:'), React.createElement(TextInput, {
            value: workspaceInput,
            onChange: setWorkspaceInput,
            onSubmit: (value) => {
                setState(s => ({ ...s, step: 'search-engine', workspaceRemote: value }));
            },
        })) : null, state.step === 'search-engine' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, { bold: true }, 'Search engine:'), React.createElement(SelectInput, {
            items: searchEngineItems,
            onSelect: (item) => {
                const engine = String(item.value);
                if (engine === 'lancedb') {
                    setState(s => ({ ...s, step: 'embedding-provider', searchEngine: engine }));
                }
                else {
                    setState(s => ({ ...s, step: 'reranker', searchEngine: engine }));
                }
            },
        })) : null, state.step === 'embedding-provider' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, { bold: true }, 'Embedding provider:'), React.createElement(SelectInput, {
            items: [
                { label: 'Ollama (local, no API key needed)', value: 'ollama' },
                { label: 'OpenAI (cloud, requires API key)', value: 'openai' },
                { label: 'Jina AI (cloud, requires API key)', value: 'jina' },
            ],
            onSelect: (item) => {
                const provider = String(item.value);
                if (provider === 'ollama') {
                    setState(s => ({ ...s, step: 'ollama-url', embeddingProvider: provider }));
                }
                else if (provider === 'openai') {
                    setState(s => ({ ...s, step: 'openai-key', embeddingProvider: provider }));
                }
                else {
                    setState(s => ({ ...s, step: 'jina-key', embeddingProvider: provider }));
                }
            },
        })) : null, state.step === 'ollama-url' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, null, 'Ollama base URL:'), React.createElement(Text, { dimColor: true }, '  (default: http://localhost:11434 — press Enter to confirm)'), React.createElement(TextInput, {
            value: ollamaUrlInput,
            onChange: setOllamaUrlInput,
            onSubmit: (value) => {
                setState(s => ({ ...s, step: 'ollama-model', embeddingUrl: value || 'http://localhost:11434' }));
            },
        })) : null, state.step === 'ollama-model' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, null, 'Ollama embedding model:'), React.createElement(Text, { dimColor: true }, '  (default: mxbai-embed-large — run `ollama pull mxbai-embed-large` to install)'), React.createElement(TextInput, {
            value: ollamaModelInput,
            onChange: setOllamaModelInput,
            onSubmit: (value) => {
                setState(s => ({ ...s, step: 'reranker', embeddingModel: value || 'mxbai-embed-large' }));
            },
        })) : null, state.step === 'openai-key' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, null, 'OpenAI API key:'), React.createElement(Text, { dimColor: true }, '  (will be saved to .env — press Enter to skip and set OPENAI_API_KEY manually)'), React.createElement(TextInput, {
            value: openaiKeyInput,
            onChange: setOpenaiKeyInput,
            onSubmit: (value) => {
                setState(s => ({ ...s, step: 'reranker', embeddingApiKey: value }));
            },
        })) : null, state.step === 'jina-key' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, null, 'Jina API key:'), React.createElement(Text, { dimColor: true }, '  (will be saved to .env — press Enter to skip and set JINA_API_KEY manually)'), React.createElement(TextInput, {
            value: jinaKeyInput,
            onChange: setJinaKeyInput,
            onSubmit: (value) => {
                setState(s => ({ ...s, step: 'reranker', embeddingApiKey: value }));
            },
        })) : null, state.step === 'reranker' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, { bold: true }, 'Enable reranker?'), React.createElement(Text, { dimColor: true }, '  Re-ranks results with AI for better precision (needs Jina or Cohere API key)'), React.createElement(SelectInput, {
            items: [
                { label: 'No', value: 'no' },
                { label: 'Yes', value: 'yes' },
            ],
            onSelect: (item) => {
                if (String(item.value) === 'yes') {
                    setState(s => ({ ...s, step: 'reranker-provider' }));
                }
                else {
                    if (setupRunning.current)
                        return;
                    setupRunning.current = true;
                    const finalState = { ...state, step: 'done', enableReranker: false };
                    setState(finalState);
                    runSetup(finalState, gitRoot).then(({ lines, autoMemoryWarning: warn }) => {
                        setSummary(lines);
                        setAutoMemoryWarning(warn);
                        setDone(true);
                    }).catch((err) => {
                        setSummary([`Setup failed: ${err.message}`]);
                        setDone(true);
                    });
                }
            },
        })) : null, state.step === 'reranker-provider' ? React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, { bold: true }, 'Reranker provider:'), React.createElement(SelectInput, {
            items: [
                { label: 'Jina AI  (set JINA_API_KEY)', value: 'jina' },
                { label: 'Cohere   (set COHERE_API_KEY)', value: 'cohere' },
            ],
            onSelect: (item) => {
                if (setupRunning.current)
                    return;
                setupRunning.current = true;
                const finalState = { ...state, step: 'done', enableReranker: true, rerankerProvider: String(item.value) };
                setState(finalState);
                runSetup(finalState, gitRoot).then(({ lines, autoMemoryWarning: warn }) => {
                    setSummary(lines);
                    setAutoMemoryWarning(warn);
                    setDone(true);
                }).catch((err) => {
                    setSummary([`Setup failed: ${err.message}`]);
                    setDone(true);
                });
            },
        })) : null);
    }
    const { waitUntilExit } = render(React.createElement(OnboardingApp));
    await waitUntilExit();
}
//# sourceMappingURL=onboarding.js.map