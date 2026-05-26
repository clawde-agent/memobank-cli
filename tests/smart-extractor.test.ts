import * as fs from 'fs';
import { extract } from '../src/core/smart-extractor';

describe('SYSTEM_PROMPT schema', () => {
  it('includes code_refs in the extraction JSON schema', () => {
    const moduleText = fs.readFileSync('src/core/smart-extractor.ts', 'utf-8');
    expect(moduleText).toContain('"code_refs"');
    expect(moduleText).toContain('file.ts::symbolName');
  });
});

describe('extract — prompt quality', () => {
  it('returns empty array when no API key', async () => {
    const result = await extract('some session text', undefined);
    expect(result).toEqual([]);
  });

  const itIfApiKey = process.env.ANTHROPIC_API_KEY ? it : it.skip;

  itIfApiKey(
    'extracts HIGH priority memories and skips low-value content',
    async () => {
      const session = `
User: how do I handle the JWT expiry bug?
Assistant: The root cause is that we were not checking the exp claim before decoding.
The fix: always validate exp before trusting the payload. This is a non-obvious security issue
because the JWT library silently accepts expired tokens in some edge cases.
User: ok
Assistant: ok
`;
      const result = await extract(session, process.env.ANTHROPIC_API_KEY);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((r) => r.name && r.type && r.description && r.content)).toBe(true);
    },
    30000
  );

  itIfApiKey(
    'does not extract more than warranted from trivial session',
    async () => {
      const session = `
User: can you run the tests?
Assistant: Running tests now.
User: ok thanks
`;
      const result = await extract(session, process.env.ANTHROPIC_API_KEY);
      expect(result).toHaveLength(0);
    },
    30000
  );
});
