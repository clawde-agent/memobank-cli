/**
 * Tests for individual capture provider modules.
 * Each provider is tested with mocked network calls — no real API calls.
 */

// ---- anthropic ----
describe('createAnthropicProvider', () => {
  const validItem = {
    name: 'test-lesson',
    type: 'lesson',
    description: 'A test',
    tags: [],
    confidence: 'medium',
    content: 'Body',
  };

  it('calls Anthropic API and returns validated results', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: JSON.stringify([validItem]) }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const { createAnthropicProvider } = await import('../src/core/providers/anthropic');
    const results = await createAnthropicProvider('sk-ant-test', 'claude-haiku-4-5').extract(
      'text'
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('test-lesson');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns [] when API response has no content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [] }),
    }) as unknown as typeof fetch;
    const { createAnthropicProvider } = await import('../src/core/providers/anthropic');
    expect(await createAnthropicProvider('key', 'model').extract('text')).toEqual([]);
  });

  it('returns [] on fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    const { createAnthropicProvider } = await import('../src/core/providers/anthropic');
    expect(await createAnthropicProvider('key', 'model').extract('text')).toEqual([]);
  });

  it('drops items that fail validation', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify([
              validItem,
              { name: 'bad', type: 'INVALID_TYPE', description: '', content: '' },
            ]),
          },
        ],
      }),
    }) as unknown as typeof fetch;
    const { createAnthropicProvider } = await import('../src/core/providers/anthropic');
    const results = await createAnthropicProvider('key', 'model').extract('text');
    expect(results).toHaveLength(1); // second item dropped
  });
});
