/**
 * Onboarding command (memo init)
 * 4-step interactive TUI setup wizard using Ink
 */

import React, { useState } from 'react';
import { render, Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { MultiSelect, MultiSelectItem } from '../components/MultiSelect';
import { findRepoRoot, getPersonalDir, migrateToPersonal } from '../core/store';
import { loadConfig, writeConfig, initConfig } from '../config';
import { installClaudeCode } from '../platforms/claude-code';
import { installCodex } from '../platforms/codex';
import { installGemini, detectGemini } from '../platforms/gemini';
import { installQwen, detectQwen } from '../platforms/qwen';
import { installCursor } from '../platforms/cursor';
import { teamInit } from './team';

/** Detect git repo name from cwd */
function detectProjectName(): string {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8', stdio: 'pipe',
    }).trim();
    return path.basename(result);
  } catch {
    return path.basename(process.cwd());
  }
}

/** Detect which platforms are installed */
function detectPlatforms(): MultiSelectItem[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const isInPath = (cmd: string): boolean => {
    try { execSync(`which ${cmd}`, { stdio: 'pipe' }); return true; } catch { return false; }
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
      hint: detectGemini() ? '✓ detected' : 'not found',
    },
    {
      label: 'Qwen Code',
      value: 'qwen',
      hint: detectQwen() ? '✓ detected' : 'not found',
    },
    {
      label: 'Cursor',
      value: 'cursor',
      hint: fs.existsSync(path.join(process.cwd(), '.cursor')) ? '✓ detected' : 'not found',
    },
  ];
}

/** Get default-selected platform values (detected ones) */
function getDetectedPlatforms(items: MultiSelectItem[]): string[] {
  return items.filter(i => i.hint?.includes('✓')).map(i => i.value);
}

type Step = 'project-name' | 'platforms' | 'team-repo' | 'search-engine' | 'done';

interface OnboardingState {
  step: Step;
  projectName: string;
  platforms: string[];
  teamRepo: string;
  searchEngine: string;
}

function OnboardingApp({ repoRoot }: { repoRoot: string }) {
  const defaultName = detectProjectName();
  const platformItems = detectPlatforms();
  const detectedPlatforms = getDetectedPlatforms(platformItems);

  const [state, setState] = useState<OnboardingState>({
    step: 'project-name',
    projectName: defaultName,
    platforms: detectedPlatforms,
    teamRepo: '',
    searchEngine: 'text',
  });
  const [nameInput, setNameInput] = useState(defaultName);
  const [teamInput, setTeamInput] = useState('');
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<string[]>([]);

  const searchEngineItems = [
    { label: 'Text (recommended, zero setup)', value: 'text' },
    { label: 'Vector / LanceDB (better recall, requires Ollama or OpenAI)', value: 'lancedb' },
  ];

  if (done) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="green" bold>✓ memobank initialized!</Text>
        {summary.map((line, i) => <Text key={i} dimColor>  {line}</Text>)}
        <Text dimColor>Run: memo recall "anything" to test</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">🧠  Memobank Setup</Text>
      <Text> </Text>

      {state.step === 'project-name' && (
        <Box flexDirection="column">
          <Text>Project name:</Text>
          <TextInput
            value={nameInput}
            onChange={setNameInput}
            onSubmit={(value) => {
              setState(s => ({ ...s, step: 'platforms', projectName: value || defaultName }));
            }}
          />
        </Box>
      )}

      {state.step === 'platforms' && (
        <MultiSelect
          label="Select platforms to integrate:"
          items={platformItems}
          defaultSelected={detectedPlatforms}
          onSubmit={(selected) => {
            setState(s => ({ ...s, step: 'team-repo', platforms: selected }));
          }}
        />
      )}

      {state.step === 'team-repo' && (
        <Box flexDirection="column">
          <Text>Team memory repo <Text dimColor>(optional — Enter to skip):</Text></Text>
          <TextInput
            value={teamInput}
            onChange={setTeamInput}
            onSubmit={(value) => {
              setState(s => ({ ...s, step: 'search-engine', teamRepo: value }));
            }}
          />
        </Box>
      )}

      {state.step === 'search-engine' && (
        <Box flexDirection="column">
          <Text bold>Search engine:</Text>
          <SelectInput
            items={searchEngineItems}
            onSelect={(item) => {
              const finalState = { ...state, searchEngine: item.value };
              setState({ ...finalState, step: 'done' });
              // Run setup asynchronously
              runSetup(finalState, repoRoot).then(lines => {
                setSummary(lines);
                setDone(true);
              }).catch((err: Error) => {
                setSummary([`Setup failed: ${err.message}`]);
                setDone(true);
              });
            }}
          />
        </Box>
      )}
    </Box>
  );
}

async function runSetup(state: OnboardingState, repoRoot: string): Promise<string[]> {
  const summaryLines: string[] = [];

  // 1. Init config
  initConfig(repoRoot, state.projectName);

  // 2. Create personal/ directory structure
  const personalDir = getPersonalDir(repoRoot);
  const TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
  for (const type of TYPES) {
    fs.mkdirSync(path.join(personalDir, type), { recursive: true });
  }
  fs.mkdirSync(path.join(repoRoot, 'memory'), { recursive: true });

  // 3. Migrate existing root-level memories
  const { migrated, skipped } = migrateToPersonal(repoRoot);
  if (migrated.length > 0) { summaryLines.push(`Migrated ${migrated.length} existing memories to personal/`); }
  if (skipped.length > 0) { summaryLines.push(`Skipped ${skipped.length} files (conflict) — resolve manually`); }

  summaryLines.push(`Personal memories: ${personalDir}`);

  // 4. Install platform adapters
  for (const platform of state.platforms) {
    switch (platform) {
      case 'claude-code': await installClaudeCode(repoRoot); break;
      case 'codex': await installCodex(process.cwd()); break;
      case 'gemini': await installGemini(); break;
      case 'qwen': await installQwen(); break;
      case 'cursor': await installCursor(process.cwd()); break;
    }
  }
  if (state.platforms.length > 0) {
    summaryLines.push(`Platforms: ${state.platforms.join(', ')}`);
  }

  // 5. Set up team repo if provided
  if (state.teamRepo.trim()) {
    try {
      await teamInit(state.teamRepo.trim(), repoRoot);
      summaryLines.push(`Team repo: linked`);
    } catch (e) {
      summaryLines.push(`Team repo: setup failed — ${(e as Error).message}`);
    }
  }

  // 6. Update engine config if lancedb
  if (state.searchEngine === 'lancedb') {
    const config = loadConfig(repoRoot);
    config.embedding.engine = 'lancedb';
    writeConfig(repoRoot, config);
  }

  return summaryLines;
}

export async function onboardingCommand(): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const { waitUntilExit } = render(<OnboardingApp repoRoot={repoRoot} />);
  await waitUntilExit();
}
