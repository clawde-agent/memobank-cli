import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Ajv from 'ajv';
import { installClaudeCode, type ClaudeCodeSettings } from '../src/platforms/claude-code';

/**
 * Claude Code settings JSON schema (subset for hooks validation)
 * Based on https://www.schemastore.org/claude-code-settings.json
 */
const CLAUDE_CODE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    hooks: {
      type: 'object',
      properties: {
        Stop: {
          type: 'array',
          items: {
            $ref: '#/$defs/hookMatcher',
          },
        },
        PreToolUse: {
          type: 'array',
          items: {
            $ref: '#/$defs/hookMatcher',
          },
        },
        PostToolUse: {
          type: 'array',
          items: {
            $ref: '#/$defs/hookMatcher',
          },
        },
        PermissionRequest: {
          type: 'array',
          items: {
            $ref: '#/$defs/hookMatcher',
          },
        },
        UserPromptSubmit: {
          type: 'array',
          items: {
            $ref: '#/$defs/hookMatcher',
          },
        },
        Notification: {
          type: 'array',
          items: {
            $ref: '#/$defs/hookMatcher',
          },
        },
      },
      additionalProperties: {
        type: 'array',
        items: {
          $ref: '#/$defs/hookMatcher',
        },
      },
    },
  },
  $defs: {
    hookMatcher: {
      type: 'object',
      properties: {
        matcher: {
          type: 'string',
        },
        hooks: {
          type: 'array',
          items: {
            $ref: '#/$defs/hookCommand',
          },
          minItems: 1,
        },
      },
      required: ['hooks'],
      additionalProperties: false,
    },
    hookCommand: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['command', 'prompt', 'agent', 'http'],
        },
        command: {
          type: 'string',
        },
        prompt: {
          type: 'string',
        },
        url: {
          type: 'string',
        },
        timeout: {
          type: 'number',
        },
        async: {
          type: 'boolean',
        },
        statusMessage: {
          type: 'string',
        },
        model: {
          type: 'string',
        },
        headers: {
          type: 'object',
          additionalProperties: {
            type: 'string',
          },
        },
        allowedEnvVars: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
      required: ['type'],
      additionalProperties: false,
      allOf: [
        {
          if: {
            properties: {
              type: {
                const: 'command',
              },
            },
          },
          then: {
            required: ['command'],
          },
        },
        {
          if: {
            properties: {
              type: {
                const: 'prompt',
              },
            },
          },
          then: {
            required: ['prompt'],
          },
        },
        {
          if: {
            properties: {
              type: {
                const: 'agent',
              },
            },
          },
          then: {
            required: ['prompt'],
          },
        },
        {
          if: {
            properties: {
              type: {
                const: 'http',
              },
            },
          },
          then: {
            required: ['url'],
          },
        },
      ],
    },
  },
} as const;

const ajv = new Ajv();

function makeTempHome(): { home: string; settingsPath: string; cleanup: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-install-'));
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const origHome = process.env.HOME;
  const origUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return {
    home,
    settingsPath,
    cleanup: () => {
      process.env.HOME = origHome;
      process.env.USERPROFILE = origUserProfile;
      fs.rmSync(home, { recursive: true });
    },
  };
}

describe('installClaudeCode — Stop hook', () => {
  it('writes Stop hook for memo process-queue --background', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as ClaudeCodeSettings;
    const stopHooks = settings.hooks?.Stop;
    expect(stopHooks).toBeDefined();
    expect(
      stopHooks!.some((h) =>
        h.hooks?.some((cmd) => cmd.command?.includes('process-queue --background'))
      )
    ).toBe(true);
    cleanup();
  });

  it('merges Stop hook without removing existing hooks', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'some-other-hook' }] }],
        },
      })
    );
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as ClaudeCodeSettings;
    const stopHooks = settings.hooks?.Stop;
    expect(stopHooks!.some((h) => h.hooks?.some((cmd) => cmd.command === 'some-other-hook'))).toBe(
      true
    );
    expect(
      stopHooks!.some((h) =>
        h.hooks?.some((cmd) => cmd.command?.includes('process-queue --background'))
      )
    ).toBe(true);
    cleanup();
  });

  it('does not add duplicate Stop hook if already present', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'memo process-queue --background' }],
            },
          ],
        },
      })
    );
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as ClaudeCodeSettings;
    const stopHooks = settings.hooks?.Stop;
    const count = stopHooks!.filter((h) =>
      h.hooks?.some((cmd) => cmd.command?.includes('process-queue --background'))
    ).length;
    expect(count).toBe(1);
    cleanup();
  });

  it('generates settings that validate against Claude Code JSON schema', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

    const validate = ajv.compile(CLAUDE_CODE_SCHEMA);
    const valid = validate(settings);

    expect(valid).toBe(true);
    if (!valid) {
      console.error('Schema validation errors:', validate.errors);
    }
    cleanup();
  });

  it('validates merged settings against Claude Code JSON schema', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'existing-hook' }] }],
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }],
        },
      })
    );
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

    const validate = ajv.compile(CLAUDE_CODE_SCHEMA);
    const valid = validate(settings);

    expect(valid).toBe(true);
    if (!valid) {
      console.error('Schema validation errors:', validate.errors);
    }
    cleanup();
  });
});
