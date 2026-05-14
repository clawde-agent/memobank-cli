import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CodeSymbol, CodeEdge, IndexedLanguage } from '../types';

export const SUPPORTED_EXTENSIONS = new Map<string, IndexedLanguage>([
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

export function detectLanguage(filePath: string): IndexedLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.get(ext) ?? null;
}

function loadGrammar(language: IndexedLanguage): unknown {
  try {
    switch (language) {
      case 'typescript':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return (require('tree-sitter-typescript') as { typescript: unknown }).typescript;
      case 'javascript':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('tree-sitter-javascript') as unknown;
      case 'python':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('tree-sitter-python') as unknown;
      case 'go':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('tree-sitter-go') as unknown;
      case 'rust':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('tree-sitter-rust') as unknown;
      case 'yaml':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('tree-sitter-yaml') as unknown;
      case 'csharp': {
        // tree-sitter-c-sharp uses ESM with top-level await and cannot be require()'d directly.
        // Load the native binding via node-gyp-build instead.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ngb = require('node-gyp-build') as (root: string) => unknown;
        const csharpRoot = require
          .resolve('tree-sitter-c-sharp/package.json')
          .replace(/\/package\.json$/, '');
        return ngb(csharpRoot);
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

interface TreeNode {
  type: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number };
  endPosition: { row: number };
  childCount: number;
  parent: TreeNode | null;
  previousNamedSibling: TreeNode | null;
  child(i: number): TreeNode;
  childForFieldName(name: string): TreeNode | null;
}

function getNodeText(node: TreeNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}

function extractDocstring(node: TreeNode, source: string): string {
  const prev = node.previousNamedSibling;
  if (!prev) {
    return '';
  }
  const isComment =
    prev.type === 'comment' ||
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

function buildSignature(node: TreeNode, source: string): string {
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
function getLogicalHash(node: TreeNode, source: string): string {
  const text = source.slice(node.startIndex, node.endIndex);
  // Remove block comments /* ... */
  // Remove line comments // ...
  // Remove all whitespace
  const normalized = text.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1').replace(/\s+/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export interface ScanFileResult {
  symbols: CodeSymbol[];
  edges: CodeEdge[];
  hash: string;
}

function walkTypeScript(
  tree: { rootNode: TreeNode },
  source: string,
  relPath: string
): { symbols: CodeSymbol[]; edges: CodeEdge[] } {
  const symbols: CodeSymbol[] = [];
  const edges: CodeEdge[] = [];
  let currentClass: string | null = null;

  function findEnclosingFn(node: TreeNode): string | null {
    let cur = node.parent;
    while (cur) {
      if (
        cur.type === 'function_declaration' ||
        cur.type === 'method_definition' ||
        cur.type === 'arrow_function'
      ) {
        const nameNode = cur.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, source);
        }
      }
      cur = cur.parent;
    }
    return null;
  }

  function visit(node: TreeNode): void {
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
        let targetName: string | null = null;
        if (fnNode.type === 'identifier') {
          targetName = getNodeText(fnNode, source);
        } else if (fnNode.type === 'member_expression') {
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
      case 'import_statement': {
        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
          const raw = getNodeText(sourceNode, source);
          const moduleName = raw.replace(/^['"]|['"]$/g, '');
          edges.push({
            sourceName: relPath,
            sourceFile: relPath,
            targetName: moduleName,
            kind: 'imports',
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

function walkPython(
  tree: { rootNode: TreeNode },
  source: string,
  relPath: string
): { symbols: CodeSymbol[]; edges: CodeEdge[] } {
  const symbols: CodeSymbol[] = [];
  const edges: CodeEdge[] = [];
  let currentClass: string | null = null;

  function findEnclosingPyFn(node: TreeNode): string | null {
    let cur = node.parent;
    while (cur) {
      if (cur.type === 'function_definition') {
        const nameNode = cur.childForFieldName('name');
        if (nameNode) return getNodeText(nameNode, source);
      }
      cur = cur.parent;
    }
    return null;
  }

  function visit(node: TreeNode): void {
    switch (node.type) {
      case 'function_definition': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        const qualifiedName = currentClass ? `${currentClass}.${name}` : name;
        symbols.push({
          name,
          qualifiedName,
          kind: currentClass ? 'method' : 'function',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: buildSignature(node, source),
          docstring: extractDocstring(node, source),
          isExported: !name.startsWith('_'),
          parentName: currentClass ?? undefined,
          hash: getLogicalHash(node, source),
        });
        break;
      }
      case 'class_definition': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        currentClass = name;
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'class',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: `class ${name}`,
          docstring: extractDocstring(node, source),
          isExported: !name.startsWith('_'),
          hash: getLogicalHash(node, source),
        });
        for (let i = 0; i < node.childCount; i++) visit(node.child(i));
        currentClass = null;
        return;
      }
      case 'call': {
        const fnNode = node.childForFieldName('function');
        if (!fnNode) break;
        let targetName: string | null = null;
        if (fnNode.type === 'identifier') {
          targetName = getNodeText(fnNode, source);
        } else if (fnNode.type === 'attribute') {
          const attr = fnNode.childForFieldName('attribute');
          if (attr) targetName = getNodeText(attr, source);
        }
        if (targetName) {
          edges.push({
            sourceName: findEnclosingPyFn(node) ?? currentClass ?? relPath,
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
    for (let i = 0; i < node.childCount; i++) visit(node.child(i));
  }

  visit(tree.rootNode);
  return { symbols, edges };
}

function walkGo(
  tree: { rootNode: TreeNode },
  source: string,
  relPath: string
): { symbols: CodeSymbol[]; edges: CodeEdge[] } {
  const symbols: CodeSymbol[] = [];
  const edges: CodeEdge[] = [];

  function visit(node: TreeNode): void {
    switch (node.type) {
      case 'function_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'function',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: buildSignature(node, source),
          isExported: /^[A-Z]/.test(name),
          hash: getLogicalHash(node, source),
        });
        break;
      }
      case 'method_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'method',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: buildSignature(node, source),
          isExported: /^[A-Z]/.test(name),
          hash: getLogicalHash(node, source),
        });
        break;
      }
      case 'type_declaration': {
        for (let i = 0; i < node.childCount; i++) {
          const spec = node.child(i);
          if (spec.type !== 'type_spec') continue;
          const nameNode = spec.childForFieldName('name');
          if (!nameNode) continue;
          const name = getNodeText(nameNode, source);
          const typeNode = spec.childForFieldName('type');
          const kind = typeNode?.type === 'interface_type' ? 'interface' : 'class';
          symbols.push({
            name,
            qualifiedName: name,
            kind,
            file: relPath,
            lineStart: spec.startPosition.row + 1,
            lineEnd: spec.endPosition.row + 1,
            signature: `type ${name}`,
            isExported: /^[A-Z]/.test(name),
            hash: getLogicalHash(spec, source),
          });
        }
        break;
      }
      default:
        break;
    }
    for (let i = 0; i < node.childCount; i++) visit(node.child(i));
  }

  visit(tree.rootNode);
  // Call edges for Go are not extracted — Go's method receiver syntax makes source attribution non-trivial.
  return { symbols, edges };
}

function hasVisibilityModifier(node: TreeNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === 'visibility_modifier') return true;
  }
  return false;
}

function walkRust(
  tree: { rootNode: TreeNode },
  source: string,
  relPath: string
): { symbols: CodeSymbol[]; edges: CodeEdge[] } {
  const symbols: CodeSymbol[] = [];
  const edges: CodeEdge[] = [];
  let currentImpl: string | null = null;

  function visit(node: TreeNode): void {
    switch (node.type) {
      case 'function_item': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        symbols.push({
          name,
          qualifiedName: currentImpl ? `${currentImpl}::${name}` : name,
          kind: currentImpl ? 'method' : 'function',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: buildSignature(node, source),
          isExported: hasVisibilityModifier(node),
          parentName: currentImpl ?? undefined,
          hash: getLogicalHash(node, source),
        });
        break;
      }
      case 'struct_item':
      case 'enum_item': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'class',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: node.type === 'struct_item' ? `struct ${name}` : `enum ${name}`,
          isExported: hasVisibilityModifier(node),
          hash: getLogicalHash(node, source),
        });
        break;
      }
      case 'trait_item': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'interface',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: `trait ${name}`,
          isExported: hasVisibilityModifier(node),
          hash: getLogicalHash(node, source),
        });
        break;
      }
      case 'impl_item': {
        const typeNode = node.childForFieldName('type');
        const prev = currentImpl;
        currentImpl = typeNode ? getNodeText(typeNode, source) : null;
        for (let i = 0; i < node.childCount; i++) visit(node.child(i));
        currentImpl = prev;
        return;
      }
      default:
        break;
    }
    for (let i = 0; i < node.childCount; i++) visit(node.child(i));
  }

  visit(tree.rootNode);
  return { symbols, edges };
}

function walkCSharp(
  tree: { rootNode: TreeNode },
  source: string,
  relPath: string
): { symbols: CodeSymbol[]; edges: CodeEdge[] } {
  const symbols: CodeSymbol[] = [];
  const edges: CodeEdge[] = [];
  let currentClass: string | null = null;

  function visit(node: TreeNode): void {
    switch (node.type) {
      case 'class_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        const prev = currentClass;
        currentClass = name;
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'class',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: `class ${name}`,
          isExported: true, // C# access modifiers require modifier-node inspection; true is a safe approximation
          hash: getLogicalHash(node, source),
        });
        for (let i = 0; i < node.childCount; i++) visit(node.child(i));
        currentClass = prev;
        return;
      }
      case 'interface_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'interface',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: `interface ${name}`,
          isExported: true,
          hash: getLogicalHash(node, source),
        });
        break;
      }
      case 'method_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        symbols.push({
          name,
          qualifiedName: currentClass ? `${currentClass}.${name}` : name,
          kind: 'method',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: buildSignature(node, source),
          isExported: true,
          parentName: currentClass ?? undefined,
          hash: getLogicalHash(node, source),
        });
        break;
      }
      default:
        break;
    }
    for (let i = 0; i < node.childCount; i++) visit(node.child(i));
  }

  visit(tree.rootNode);
  return { symbols, edges };
}

export function scanFile(filePath: string, scanRoot: string): ScanFileResult {
  const language = detectLanguage(filePath);
  if (!language) {
    return { symbols: [], edges: [], hash: '' };
  }

  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { symbols: [], edges: [], hash: '' };
  }

  const hash = crypto.createHash('sha256').update(source).digest('hex');
  const relPath = path.relative(scanRoot, filePath);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ParserCtor: new () => any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('tree-sitter') as { default?: unknown } | unknown;
    // tree-sitter may export as default or as the constructor directly
    ParserCtor = (mod as { default?: new () => unknown }).default ?? (mod as new () => unknown);
  } catch {
    return { symbols: [], edges: [], hash };
  }

  const grammar = loadGrammar(language);
  if (!grammar) {
    return { symbols: [], edges: [], hash };
  }

  try {
    const parser = new ParserCtor();
    parser.setLanguage(grammar);
    const tree = parser.parse(source) as { rootNode: TreeNode };

    if (language === 'typescript' || language === 'javascript') {
      const result = walkTypeScript(tree, source, relPath);
      return { ...result, hash };
    }
    if (language === 'python') {
      const result = walkPython(tree, source, relPath);
      return { ...result, hash };
    }
    if (language === 'go') {
      const result = walkGo(tree, source, relPath);
      return { ...result, hash };
    }
    if (language === 'rust') {
      const result = walkRust(tree, source, relPath);
      return { ...result, hash };
    }
    if (language === 'csharp') {
      const result = walkCSharp(tree, source, relPath);
      return { ...result, hash };
    }
    return { symbols: [], edges: [], hash };
  } catch {
    return { symbols: [], edges: [], hash };
  }
}

export function hashFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}
