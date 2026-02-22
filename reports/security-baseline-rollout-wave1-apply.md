# Security Baseline Rollout

Generated: 2026-02-22T19:24:19.445Z

## Summary

- Owner: **Trancendos**
- Min risk score: **30**
- Dry run: **false**
- Targeted repositories: **20**
- Applied: **0**
- No changes needed: **0**
- Permission denied: **20**
- Failed: **0**

## Action refs used

- actions/checkout: `34e114876b0b11c390a56381ad16ebd13914f8d5`
- actions/dependency-review-action: `05fe4576374b728f0c523d6a13d64c25081e0803`
- aquasecurity/trivy-action: `76071ef0d7ec797419534a183b498b4d6366cf37`

## Repository Results

| Repository | Status | Planned files | PR |
|---|---|---|---|
| secrets-portal | permission_denied | .github/CODEOWNERS, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-treasury | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-sanctuary | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-observatory | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-nexus | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-lighthouse | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-library | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-ice-box | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-hive | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-foundation | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-forge | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-dr-ai | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-cryptex | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-citadel | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| the-agora | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| solarscene-ai | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| shared-core | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| serenity-ai | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| sentinel-ai | permission_denied | SECURITY.md, .github/CODEOWNERS, .github/dependabot.yml, .github/workflows/dependency-review.yml, .github/workflows/security-cve-scan.yml |  |
| trancendos-ecosystem | permission_denied | .github/CODEOWNERS, .github/workflows/dependency-review.yml |  |

## Permission Constraints

This environment token can read repositories but cannot create branches or PRs in sibling repositories.
Re-run this script in a privileged environment with `contents:write` and `pull_requests:write` access.
