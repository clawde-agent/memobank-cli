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
exports.SUPPORTED_EXTENSIONS = void 0;
exports.detectLanguage = detectLanguage;
exports.scanFile = scanFile;
exports.hashFile = hashFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
exports.SUPPORTED_EXTENSIONS = new Map([
    ['.ts', 'typescript'],
    ['.tsx', 'typescript'],
    ['.js', 'javascript'],
    ['.mjs', 'javascript'],
    ['.py', 'python'],
    ['.go', 'go'],
    ['.rs', 'rust'],
    ['.yaml', 'yaml'],
    ['.yml', 'yaml'],
    ['.cs', 'csharp'],
]);
function detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return exports.SUPPORTED_EXTENSIONS.get(ext) ?? null;
}
function loadGrammar(language) {
    try {
        switch (language) {
            case 'typescript':
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                return require('tree-sitter-typescript').typescript;
            case 'javascript':
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                return require('tree-sitter-javascript');
            case 'python':
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                return require('tree-sitter-python');
            case 'go':
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                return require('tree-sitter-go');
            case 'rust':
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                return require('tree-sitter-rust');
            case 'yaml':
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                return require('tree-sitter-yaml');
            case 'csharp':
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                return require('tree-sitter-c-sharp');
            default:
                return null;
        }
    }
    catch {
        return null;
    }
}
function getNodeText(node, source) {
    return source.slice(node.startIndex, node.endIndex);
}
function extractDocstring(node, source) {
    const prev = node.previousNamedSibling;
    if (!prev) {
        return '';
    }
    const isComment = prev.type === 'comment' ||
        prev.type === 'block_comment' ||
        prev.type === 'line_comment' ||
        prev.type === 'expression_statement';
    if (!isComment) {
        return '';
    }
    const raw = getNodeText(prev, source);
    return raw
        .replace(/^\/\*\*?|\*\/$/g, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, '').trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
}
function buildSignature(node, source) {
    const text = getNodeText(node, source);
    const bodyStart = text.indexOf('{');
    const arrowStart = text.indexOf('=>');
    const cutoff = bodyStart !== -1 ? bodyStart : arrowStart !== -1 ? arrowStart : text.length;
    return text.slice(0, cutoff).replace(/\s+/g, ' ').trim();
}
/**
 * Generates a stable hash of a symbol's implementation.
 * Normalizes by removing comments and whitespace.
 */
function getLogicalHash(node, source) {
    const text = source.slice(node.startIndex, node.endIndex);
    // Remove block comments /* ... */
    // Remove line comments // ...
    // Remove all whitespace
    const normalized = text
        .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1')
        .replace(/\s+/g, '');
    return crypto.createHash('sha256').update(normalized).digest('hex');
}
function walkTypeScript(tree, source, relPath) {
    const symbols = [];
    const edges = [];
    let currentClass = null;
    function findEnclosingFn(node) {
        let cur = node.parent;
        while (cur) {
            if (cur.type === 'function_declaration' ||
                cur.type === 'method_definition' ||
                cur.type === 'arrow_function') {
                const nameNode = cur.childForFieldName('name');
                if (nameNode) {
                    return getNodeText(nameNode, source);
                }
            }
            cur = cur.parent;
        }
        return null;
    }
    function visit(node) {
        switch (node.type) {
            case 'function_declaration': {
                const nameNode = node.childForFieldName('name');
                if (!nameNode) {
                    break;
                }
                const name = getNodeText(nameNode, source);
                const isExported = node.parent?.type === 'export_statement';
                const qualifiedName = currentClass ? `${currentClass}.${name}` : name;
                symbols.push({
                    name,
                    qualifiedName,
                    kind: currentClass ? 'method' : 'function',
                    file: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    signature: buildSignature(node, source),
                    docstring: extractDocstring(isExported ? (node.parent ?? node) : node, source),
                    isExported,
                    parentName: currentClass ?? undefined,
                    hash: getLogicalHash(node, source),
                });
                break;
            }
            case 'method_definition':
            case 'method_signature': {
                const nameNode = node.childForFieldName('name');
                if (!nameNode) {
                    break;
                }
                const name = getNodeText(nameNode, source);
                const qualifiedName = currentClass ? `${currentClass}.${name}` : name;
                symbols.push({
                    name,
                    qualifiedName,
                    kind: 'method',
                    file: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    signature: buildSignature(node, source),
                    docstring: extractDocstring(node, source),
                    isExported: false,
                    parentName: currentClass ?? undefined,
                    hash: getLogicalHash(node, source),
                });
                break;
            }
            case 'class_declaration': {
                const nameNode = node.childForFieldName('name');
                if (!nameNode) {
                    break;
                }
                const name = getNodeText(nameNode, source);
                const isExported = node.parent?.type === 'export_statement';
                currentClass = name;
                symbols.push({
                    name,
                    qualifiedName: name,
                    kind: 'class',
                    file: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    signature: `class ${name}`,
                    docstring: extractDocstring(isExported ? (node.parent ?? node) : node, source),
                    isExported,
                    hash: getLogicalHash(node, source),
                });
                for (let i = 0; i < node.childCount; i++) {
                    visit(node.child(i));
                }
                currentClass = null;
                return;
            }
            case 'interface_declaration': {
                const nameNode = node.childForFieldName('name');
                if (!nameNode) {
                    break;
                }
                const name = getNodeText(nameNode, source);
                const isExported = node.parent?.type === 'export_statement';
                symbols.push({
                    name,
                    qualifiedName: name,
                    kind: 'interface',
                    file: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    signature: `interface ${name}`,
                    docstring: extractDocstring(isExported ? (node.parent ?? node) : node, source),
                    isExported,
                    hash: getLogicalHash(node, source),
                });
                break;
            }
            case 'type_alias_declaration': {
                const nameNode = node.childForFieldName('name');
                if (!nameNode) {
                    break;
                }
                const name = getNodeText(nameNode, source);
                const isExported = node.parent?.type === 'export_statement';
                symbols.push({
                    name,
                    qualifiedName: name,
                    kind: 'type',
                    file: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    signature: `type ${name}`,
                    isExported,
                    hash: getLogicalHash(node, source),
                });
                break;
            }
            case 'call_expression': {
                const fnNode = node.childForFieldName('function');
                if (!fnNode) {
                    break;
                }
                let targetName = null;
                if (fnNode.type === 'identifier') {
                    targetName = getNodeText(fnNode, source);
                }
                else if (fnNode.type === 'member_expression') {
                    const prop = fnNode.childForFieldName('property');
                    if (prop) {
                        targetName = getNodeText(prop, source);
                    }
                }
                if (targetName && targetName !== 'require') {
                    const enclosingFn = findEnclosingFn(node);
                    edges.push({
                        sourceName: enclosingFn ?? relPath,
                        sourceFile: relPath,
                        targetName,
                        kind: 'calls',
                        line: node.startPosition.row + 1,
                    });
                }
                break;
            }
            default:
                break;
        }
        for (let i = 0; i < node.childCount; i++) {
            visit(node.child(i));
        }
    }
    visit(tree.rootNode);
    return { symbols, edges };
}
function scanFile(filePath, scanRoot) {
    const language = detectLanguage(filePath);
    if (!language) {
        return { symbols: [], edges: [], hash: '' };
    }
    let source;
    try {
        source = fs.readFileSync(filePath, 'utf-8');
    }
    catch {
        return { symbols: [], edges: [], hash: '' };
    }
    const hash = crypto.createHash('sha256').update(source).digest('hex');
    const relPath = path.relative(scanRoot, filePath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ParserCtor;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('tree-sitter');
        // tree-sitter may export as default or as the constructor directly
        ParserCtor = mod.default ?? mod;
    }
    catch {
        return { symbols: [], edges: [], hash };
    }
    const grammar = loadGrammar(language);
    if (!grammar) {
        return { symbols: [], edges: [], hash };
    }
    try {
        const parser = new ParserCtor();
        parser.setLanguage(grammar);
        const tree = parser.parse(source);
        if (language === 'typescript' || language === 'javascript') {
            const result = walkTypeScript(tree, source, relPath);
            return { ...result, hash };
        }
        return { symbols: [], edges: [], hash };
    }
    catch {
        return { symbols: [], edges: [], hash };
    }
}
function hashFile(filePath) {
    try {
        const content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=code-scanner.js.map