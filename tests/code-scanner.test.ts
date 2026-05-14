import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanFile, detectLanguage, SUPPORTED_EXTENSIONS } from '../src/core/code-scanner';

function makeTmpFile(ext: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-scanner-'));
  const file = path.join(dir, `test${ext}`);
  fs.writeFileSync(file, content);
  return file;
}

describe('detectLanguage', () => {
  it('detects typescript from .ts extension', () => {
    expect(detectLanguage('src/core/store.ts')).toBe('typescript');
  });

  it('detects python from .py extension', () => {
    expect(detectLanguage('scripts/build.py')).toBe('python');
  });

  it('returns null for unsupported extension', () => {
    expect(detectLanguage('file.java')).toBeNull();
  });

  it('SUPPORTED_EXTENSIONS includes .tsx', () => {
    expect(SUPPORTED_EXTENSIONS.has('.tsx')).toBe(true);
  });
});

describe('scanFile — TypeScript', () => {
  it('extracts exported function with signature and docstring', () => {
    const src = `
/**
 * Resolve repo root by walking up from cwd
 */
export function findRepoRoot(cwd: string, repoFlag?: string): string {
  return cwd;
}
`;
    const file = makeTmpFile('.ts', src);
    const { symbols } = scanFile(file, path.dirname(file));
    const fn = symbols.find((s) => s.name === 'findRepoRoot');
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe('function');
    expect(fn!.isExported).toBe(true);
    expect(fn!.signature).toContain('findRepoRoot');
    expect(fn!.docstring).toContain('Resolve repo root');
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it('extracts class with methods', () => {
    const src = `
export class TextEngine {
  async search(query: string): Promise<string[]> {
    return [];
  }
}
`;
    const file = makeTmpFile('.ts', src);
    const { symbols } = scanFile(file, path.dirname(file));
    const cls = symbols.find((s) => s.name === 'TextEngine');
    const method = symbols.find((s) => s.name === 'search');
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe('class');
    expect(method).toBeDefined();
    expect(method!.kind).toBe('method');
    expect(method!.qualifiedName).toBe('TextEngine.search');
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it('extracts call edges', () => {
    const src = `
export function main(): void {
  findRepoRoot(process.cwd());
}
`;
    const file = makeTmpFile('.ts', src);
    const { edges } = scanFile(file, path.dirname(file));
    const edge = edges.find((e) => e.targetName === 'findRepoRoot');
    expect(edge).toBeDefined();
    expect(edge!.kind).toBe('calls');
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it('returns empty arrays for non-parseable file', () => {
    const file = makeTmpFile('.ts', '<<< not valid typescript >>>');
    const { symbols, edges } = scanFile(file, path.dirname(file));
    expect(Array.isArray(symbols)).toBe(true);
    expect(Array.isArray(edges)).toBe(true);
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it('non-exported functions have isExported=false', () => {
    const src = `function internal(): void {}`;
    const file = makeTmpFile('.ts', src);
    const { symbols } = scanFile(file, path.dirname(file));
    const fn = symbols.find((s) => s.name === 'internal');
    expect(fn?.isExported).toBe(false);
    fs.rmSync(path.dirname(file), { recursive: true });
  });
});

function tmpPy(code: string): string {
  const f = path.join(os.tmpdir(), `memo_test_${Date.now()}.py`);
  fs.writeFileSync(f, code);
  return f;
}

describe('scanFile — python', () => {
  test('python: extracts top-level function', () => {
    const f = tmpPy('def greet(name):\n    return name\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'greet' && s.kind === 'function')).toBe(true);
    expect(symbols.find((s) => s.name === 'greet')?.isExported).toBe(true);
  });

  test('python: extracts class and method', () => {
    const f = tmpPy('class Dog:\n    def bark(self):\n        pass\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'Dog' && s.kind === 'class')).toBe(true);
    expect(symbols.some((s) => s.name === 'bark' && s.kind === 'method')).toBe(true);
    expect(symbols.find((s) => s.name === 'bark')?.parentName).toBe('Dog');
  });

  test('python: _private functions are not exported', () => {
    const f = tmpPy('def _helper():\n    pass\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.find((s) => s.name === '_helper')?.isExported).toBe(false);
  });
});

describe('scanFile — go', () => {
  function tmpGo(code: string): string {
    const f = path.join(os.tmpdir(), `memo_test_${Date.now()}.go`);
    fs.writeFileSync(f, code);
    return f;
  }

  test('go: extracts function', () => {
    const f = tmpGo('package main\nfunc Hello() string { return "hi" }\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'Hello' && s.kind === 'function')).toBe(true);
  });

  test('go: extracts method on struct', () => {
    const f = tmpGo('package main\ntype Dog struct{}\nfunc (d Dog) Bark() {}\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'Bark' && s.kind === 'method')).toBe(true);
  });

  test('go: exported function has isExported=true', () => {
    const f = tmpGo('package main\nfunc PublicFn() {}\nfunc privateFn() {}\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.find((s) => s.name === 'PublicFn')?.isExported).toBe(true);
    expect(symbols.find((s) => s.name === 'privateFn')?.isExported).toBe(false);
  });

  test('go: extracts struct type', () => {
    const f = tmpGo('package main\ntype Dog struct { Name string }\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'Dog' && s.kind === 'class')).toBe(true);
  });
});

describe('scanFile — rust', () => {
  function tmpRs(code: string): string {
    const f = path.join(os.tmpdir(), `memo_test_${Date.now()}.rs`);
    fs.writeFileSync(f, code);
    return f;
  }

  test('rust: extracts function', () => {
    const f = tmpRs('pub fn greet(name: &str) -> String { name.to_string() }\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'greet' && s.kind === 'function')).toBe(true);
  });

  test('rust: extracts struct and impl method', () => {
    const f = tmpRs('pub struct Dog;\nimpl Dog {\n    pub fn bark(&self) {}\n}\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'Dog' && s.kind === 'class')).toBe(true);
    expect(symbols.some((s) => s.name === 'bark' && s.kind === 'method')).toBe(true);
  });

  test('rust: pub function is exported', () => {
    const f = tmpRs('pub fn public_fn() {}\nfn private_fn() {}\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.find((s) => s.name === 'public_fn')?.isExported).toBe(true);
    expect(symbols.find((s) => s.name === 'private_fn')?.isExported).toBe(false);
  });

  test('rust: extracts enum and trait', () => {
    const f = tmpRs('pub enum Color { Red, Green }\npub trait Speak { fn speak(&self); }\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'Color' && s.kind === 'class')).toBe(true);
    expect(symbols.some((s) => s.name === 'Speak' && s.kind === 'interface')).toBe(true);
  });
});

describe('scanFile — csharp', () => {
  function tmpCs(code: string): string {
    const f = path.join(os.tmpdir(), `memo_test_${Date.now()}.cs`);
    fs.writeFileSync(f, code);
    return f;
  }

  test('csharp: extracts class and method', () => {
    const f = tmpCs('public class Dog {\n    public void Bark() {}\n}\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'Dog' && s.kind === 'class')).toBe(true);
    expect(symbols.some((s) => s.name === 'Bark' && s.kind === 'method')).toBe(true);
  });

  test('csharp: extracts interface', () => {
    const f = tmpCs('public interface IAnimal {\n    void Speak();\n}\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.some((s) => s.name === 'IAnimal' && s.kind === 'interface')).toBe(true);
  });

  test('csharp: method has parentName', () => {
    const f = tmpCs('public class Cat {\n    public void Meow() {}\n}\n');
    const { symbols } = scanFile(f, os.tmpdir());
    expect(symbols.find((s) => s.name === 'Meow')?.parentName).toBe('Cat');
  });
});

describe('scanFile — import edges', () => {
  function tmpTs(code: string): string {
    const f = path.join(os.tmpdir(), `memo_test_${Date.now()}.ts`);
    fs.writeFileSync(f, code);
    return f;
  }

  test('ts: extracts import edges', () => {
    const f = tmpTs("import { readFile } from 'fs';\nimport type { Foo } from './foo';\n");
    const { edges } = scanFile(f, os.tmpdir());
    expect(edges.some((e) => e.targetName === 'fs' && e.kind === 'imports')).toBe(true);
    expect(edges.some((e) => e.targetName === './foo' && e.kind === 'imports')).toBe(true);
  });

  test('ts: import edge sourceName is the file relPath', () => {
    const f = tmpTs("import { x } from 'lodash';\n");
    const { edges } = scanFile(f, os.tmpdir());
    const importEdge = edges.find((e) => e.kind === 'imports');
    expect(importEdge?.sourceName).toBeTruthy();
    expect(importEdge?.targetName).toBe('lodash');
  });
});
