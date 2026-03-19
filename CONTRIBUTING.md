# Contributing to Memobank CLI

Thank you for your interest in contributing to memobank CLI! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what's best for the community

## Development Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/clawde-agent/memobank-cli.git
cd memobank-cli

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev -- --help
```

## Project Structure

```
memobank-cli/
├── src/
│   ├── cli.ts              # Main CLI entry point
│   ├── config.ts           # Configuration management
│   ├── types.ts            # TypeScript type definitions
│   ├── commands/           # CLI command implementations
│   │   ├── install.ts
│   │   ├── recall.ts
│   │   ├── search.ts
│   │   ├── capture.ts
│   │   ├── write.ts
│   │   ├── index.ts
│   │   ├── review.ts
│   │   ├── map.ts
│   │   ├── import.ts
│   │   └── setup.ts
│   ├── core/               # Core business logic
│   │   ├── store.ts        # File I/O operations
│   │   ├── retriever.ts    # Memory retrieval
│   │   ├── decay-engine.ts # Relevance decay calculation
│   │   ├── embedding.ts    # Embedding generation
│   │   ├── sanitizer.ts    # Content sanitization
│   │   └── memory-template.ts # Memory templates
│   ├── engines/            # Search engine implementations
│   │   ├── engine-adapter.ts
│   │   ├── text-engine.ts
│   │   └── lancedb-engine.ts
│   └── platforms/          # Platform integrations
│       ├── claude-code.ts
│       ├── codex.ts
│       └── cursor.ts
├── tests/                  # Test files
├── docs/                   # Documentation
└── package.json
```

## Making Changes

### 1. Create an Issue

Before starting work, check existing issues or create a new one to discuss your change.

### 2. Fork and Branch

```bash
# Fork the repository
# Create a feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/issue-123
```

### 3. Coding Guidelines

#### TypeScript

- Use strict mode
- Define explicit types (no `any`)
- Use interfaces for object shapes
- Export types from `types.ts` when reusable

#### Code Style

- Use 2-space indentation
- Maximum line length: 100 characters
- Use single quotes for strings
- Add semicolons
- Use `const` over `let` when possible

#### Error Handling

```typescript
// Good: Specific error handling
try {
  await operation();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new Error(`File not found: ${path}`);
  }
  throw new Error(`Operation failed: ${(error as Error).message}`);
}
```

#### Logging

```typescript
// Use console for user-facing output
console.log('✓ Success message');
console.error('✗ Error message');

// Use debug pattern for verbose output
if (process.env.DEBUG) {
  console.log('[DEBUG] Internal state:', state);
}
```

### 4. Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Test a specific feature
npm run dev -- memo write lesson --name="test" --description="Test" --content="Test content"
```

### 5. Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Ollama embedding support
fix: correct LanceDB search API usage
docs: update README with installation steps
test: add unit tests for memory template
refactor: extract sanitization logic to separate module
```

### 6. Pull Request

1. Update documentation if needed
2. Add tests for new functionality
3. Ensure all tests pass
4. Update CHANGELOG.md
5. Request review from maintainers

## PR Checklist

- [ ] Code follows project style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] No console errors or warnings
- [ ] TypeScript compilation successful

## Design Principles

### KISS (Keep It Simple, Stupid)

- Prefer simple solutions over complex ones
- Avoid over-engineering
- Each function should do one thing

### SOLID

- **Single Responsibility**: Each module/class has one reason to change
- **Open/Closed**: Open for extension, closed for modification
- **Liskov Substitution**: Engine adapters are interchangeable
- **Interface Segregation**: Small, focused interfaces
- **Dependency Inversion**: Depend on abstractions (EngineAdapter)

### Security First

- Never store secrets in memory files
- Sanitize all user input
- Validate content before saving
- Default to safe options

## Areas for Contribution

### High Priority

- Unit tests for core modules
- Integration tests
- Performance optimization for large memory collections
- Additional embedding providers (Ollama improvements)

### Medium Priority

- Additional platform integrations (VS Code, JetBrains)
- Memory visualization tools
- Batch operations
- Memory merging/deduplication

### Nice to Have

- Web UI for memory management
- Memory sharing/collaboration features
- Advanced search filters
- Memory export/import formats

## Questions?

- Open an issue for questions
- Check existing documentation
- Review the design spec: https://github.com/clawde-agent/memobank

Thank you for contributing! 🧠
