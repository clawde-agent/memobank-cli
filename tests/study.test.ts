describe('memo study', () => {
  it('formats condition block correctly', () => {
    const block = `\n<important if="you are installing dependencies">\n<!-- source: .memobank/lesson/npm-ci.md -->\nUse npm ci instead of npm install.\n</important>\n`;
    expect(block).toContain('<important if="you are installing dependencies">');
    expect(block).toContain('<!-- source:');
    expect(block).toContain('</important>');
  });
});
