import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig, writeConfig } from '../src/config';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-config-test-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  return dir;
}

describe('loadConfig', () => {
  it('aliases team: key to workspace:', () => {
    const repo = makeTempRepo();
    fs.writeFileSync(
      path.join(repo, 'meta', 'config.yaml'),
      'project:\n  name: test\nteam:\n  remote: git@github.com:x/y.git\n  auto_sync: false\n  branch: main\n'
    );
    const config = loadConfig(repo);
    expect(config.workspace?.remote).toBe('git@github.com:x/y.git');
    expect((config as any).team).toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });

  it('loads lifecycle defaults when not configured', () => {
    const repo = makeTempRepo();
    fs.writeFileSync(path.join(repo, 'meta', 'config.yaml'), 'project:\n  name: test\n');
    const config = loadConfig(repo);
    expect(config.lifecycle?.experimental_ttl_days).toBe(30);
    expect(config.lifecycle?.active_to_review_days).toBe(90);
    fs.rmSync(repo, { recursive: true });
  });
});
