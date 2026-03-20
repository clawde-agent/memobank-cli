# Security Policy

## Supported Versions

We release patches for security vulnerabilities regularly. The following versions are currently supported:

| Version | Supported          |
| ------- | ------------------ |
| 0.5.x   | :white_check_mark: |
| < 0.5   | :x:                |

## Reporting a Vulnerability

We take the security of memobank seriously. If you believe you have found a security vulnerability, please report it to us as described below.

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email at **[INSERT SECURITY EMAIL]** or create a draft security advisory in the GitHub Security tab.

### What to Include

Please include the following information in your report:

- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact of the vulnerability
- Any suggested fixes (if applicable)

### Response Timeline

- We will acknowledge receipt of your vulnerability report within **48 hours**
- We will send you a more detailed response within **5 days** indicating the next steps
- We will keep you informed of our progress throughout the process
- We aim to resolve critical vulnerabilities within **30 days**

### Disclosure Policy

- Please give us reasonable time to respond before disclosing the issue publicly
- We will notify you when we have fixed the issue and deployed a patch
- We appreciate responsible disclosure and will credit you (with your permission) in our security advisories

## Security Best Practices for Users

When using memobank:

1. **Never commit sensitive data** to your `.memobank/` directory (API keys, passwords, etc.)
2. **Review memories before committing** to the project tier
3. **Use `memo scan`** before publishing to workspace tier
4. **Keep your CLI updated** to the latest version

## Acknowledgments

We thank the following for their contributions to our security:

- [Your name/organization] - Initial security policy

---

This security policy is inspired by [GitHub's Security Policy template](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository).
