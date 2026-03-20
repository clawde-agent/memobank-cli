# Commit & PR Guidelines

This document outlines the commit and pull request guidelines for memobank-cli.

## 📝 Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Commit messages are automatically validated by `commitlint`.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type       | Description                                              |
| ---------- | -------------------------------------------------------- |
| `feat`     | New feature (e.g., `feat: add Ollama embedding support`) |
| `fix`      | Bug fix (e.g., `fix: correct search API usage`)          |
| `docs`     | Documentation changes (e.g., `docs: update README`)      |
| `style`    | Code style changes (formatting, semicolons, etc.)        |
| `refactor` | Code refactoring (no behavior change)                    |
| `test`     | Adding or updating tests                                 |
| `chore`    | Maintenance tasks (dependencies, config, etc.)           |
| `perf`     | Performance improvements                                 |
| `ci`       | CI/CD configuration changes                              |
| `build`    | Build system or external dependencies                    |
| `revert`   | Reverting previous commits                               |

### Examples

```bash
# Good commits
feat: add LanceDB vector search support
fix: handle ENOENT error in file store
docs: add contribution guidelines
refactor: extract embedding logic to separate module
test: add unit tests for memory template
chore: update dependencies
perf: improve search performance by caching results
ci: add PR validation workflow

# With scope (optional)
feat(embedding): add Ollama embedding provider
fix(store): handle concurrent file access
docs(contributing): add commit message guidelines
```

### Rules

- **Type**: Must be one of the types listed above (lowercase)
- **Subject**:
  - Use imperative mood ("add" not "added")
  - Don't capitalize the first letter
  - No period at the end
  - Maximum 100 characters
- **Body**: Optional, wrap at 100 characters
- **Footer**: Optional, use for breaking changes (`BREAKING CHANGE:`) or issue references (`Fixes #123`)

## 🔧 Git Hooks

We use `husky` and `lint-staged` to enforce code quality:

### Pre-commit Hook

Automatically runs on staged files:

- `eslint --fix` - Auto-fix linting issues
- `prettier --write` - Auto-format code

### Commit-msg Hook

Validates commit message format using `commitlint`

### Installation

After cloning the repository:

```bash
npm install
```

This automatically installs husky hooks via the `prepare` script.

## 🚀 Pull Request Process

### Before Creating a PR

1. **Create an issue** (if one doesn't exist) to discuss the change
2. **Fork the repository** and create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-123
   ```
3. **Make your changes** following the coding guidelines
4. **Run tests locally**:
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```
5. **Commit your changes** using Conventional Commits
6. **Update documentation** if needed
7. **Update CHANGELOG.md** for user-facing changes

### PR Title

PR titles must follow Conventional Commits format:

```
feat: add new feature
fix: resolve issue #123
docs: update installation guide
```

### PR Description

Use the provided PR template. Include:

- **Description**: What changes did you make?
- **Related Issue**: Link to the issue (e.g., `Fixes #123`)
- **Type of Change**: Mark the appropriate checkbox
- **Testing**: Describe how you tested
- **Checklist**: Complete all items

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Tests added/updated and passing
- [ ] Documentation updated (if needed)
- [ ] CHANGELOG.md updated (for user-facing changes)
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Commit messages follow Conventional Commits

### Review Process

1. **Automated Checks**: All CI checks must pass
   - Tests (Node.js 18.x, 20.x, 22.x)
   - Build
   - Lint
   - Type check
   - PR validation (title, commits, description)

2. **Code Review**: At least 1 maintainer approval required

3. **Conversation Resolution**: All review comments must be addressed

### Merge Strategies

- **Squash and Merge**: Preferred for feature branches
- **Rebase and Merge**: For simple fixes (use sparingly)
- **Create Merge Commit**: For releases or significant features

## 🛠️ Helper Commands

### Commit with message

```bash
git commit -m "feat: add new feature"
```

### Commit with scope

```bash
git commit -m "feat(embedding): add Ollama support"
```

### Multi-line commit

```bash
git commit -m "feat: add new feature

> Detailed description of the feature.
>
> Fixes #123"
```

### Check commit message format

```bash
npx commitlint --from HEAD~1 --verbose
```

### Run all checks locally

```bash
npm run lint && npm run typecheck && npm test
```

## 📋 Branch Naming

| Branch Type   | Pattern           | Example                     |
| ------------- | ----------------- | --------------------------- |
| Feature       | `feature/<name>`  | `feature/ollama-embeddings` |
| Bug fix       | `fix/<name>`      | `fix/search-crash`          |
| Documentation | `docs/<name>`     | `docs/update-readme`        |
| Refactor      | `refactor/<name>` | `refactor/extract-engine`   |
| Test          | `test/<name>`     | `test/add-store-tests`      |
| Hotfix        | `hotfix/<name>`   | `hotfix/security-patch`     |

## ❓ Questions?

- Check existing issues for similar questions
- Read the [CONTRIBUTING.md](../CONTRIBUTING.md)
- Open an issue to ask questions

Thank you for contributing! 🧠
