# Branch Protection Policy

This document outlines the branch protection rules for the memobank-cli repository.

## Protected Branches

### `main` (Primary Development Branch)

**Protection Rules:**
- ✅ Pull request required before merging
- ✅ Minimum 1 approval from code owners/maintainers
- ✅ All CI status checks must pass:
  - Test (Node.js 18.x, 20.x, 22.x)
  - Build
  - Lint
  - Format check
  - Type check
- ✅ Branch must be up to date before merging
- ✅ All conversations must be resolved
- ✅ No direct pushes (including administrators)

**Purpose:** 
- Stable development branch
- All features merge here via PR
- Triggers CI/CD pipeline

### `master` (Legacy - Deprecated)

**Status:** Legacy branch, maintained for backward compatibility
**Action:** Consider migrating to `main` as the primary branch

## Branch Naming Conventions

| Prefix | Usage | Example |
|--------|-------|---------|
| `feature/` | New features | `feature/ollama-embeddings` |
| `fix/` | Bug fixes | `fix/issue-123-search-crash` |
| `docs/` | Documentation | `docs/update-contributing-guide` |
| `refactor/` | Code refactoring | `refactor/extract-engine-adapter` |
| `test/` | Test additions | `test/add-store-tests` |
| `chore/` | Maintenance | `chore/update-dependencies` |
| `hotfix/` | Critical production fixes | `hotfix/security-patch` |

## Pull Request Requirements

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] Tests added/updated and passing
- [ ] Documentation updated if needed
- [ ] CHANGELOG.md updated (for user-facing changes)
- [ ] No TypeScript errors or lint warnings
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

### Review Process

1. **Automated Checks**: All CI checks must pass
2. **Code Review**: At least 1 maintainer approval required
3. **Conversation Resolution**: All review comments must be addressed

### Merge Strategies

- **Squash and Merge**: Preferred for feature branches
- **Rebase and Merge**: For simple fixes (use sparingly)
- **Create Merge Commit**: For releases or significant features

## Release Process

1. Update `CHANGELOG.md` with release notes
2. Update version in `package.json`
3. Create and push version tag: `git tag v0.6.0`
4. Push tag triggers [release.yml](workflows/release.yml) workflow
5. GitHub Actions publishes to npm and creates GitHub Release

## Emergency Procedures

### Hotfix Workflow

For critical bugs affecting production:

1. Create `hotfix/` branch from `main`
2. Fix the issue with minimal changes
3. Request expedited review
4. Merge after CI passes and 1 approval
5. Tag and release immediately

### Bypassing Protection Rules

In rare emergencies, repository administrators can bypass protection rules:
- Use only when absolutely necessary
- Document the reason in a follow-up issue
- Notify other maintainers

## Security Considerations

- Never commit secrets, API keys, or credentials
- Dependabot updates are automatically created
- Review all external contributions carefully
- Report security issues via GitHub Security tab

## Questions?

Open an issue or contact the maintainers.
