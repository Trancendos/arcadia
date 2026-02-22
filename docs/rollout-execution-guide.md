# Portfolio Hardening Rollout Execution Guide

This guide applies the baseline security package to repositories identified by
`reports/portfolio-deep-security-scan.json`.

## What the rollout applies

- `SECURITY.md`
- `.github/CODEOWNERS`
- `.github/dependabot.yml` (github-actions + npm/pip when root manifests exist)
- `.github/workflows/dependency-review.yml`
- `.github/workflows/security-cve-scan.yml`

All GitHub Action references are pinned to immutable commit SHAs.

## Dry run (planning only)

```bash
pnpm run rollout:baseline -- --owner Trancendos --min-risk-score 30 --max-repos 60
```

Outputs:
- `reports/security-baseline-rollout.json`
- `reports/security-baseline-rollout.md`
- `reports/security-baseline-rollout.csv`

Latest planning snapshot in this branch:
- targets: **40** repositories (`min-risk-score=30`, non-forks)
- status: dry-run plan generated successfully

## Apply mode (branch + PR creation)

Requires a GitHub token with write permissions to target repositories:
- `contents:write`
- `pull_requests:write`

```bash
export GH_TOKEN="<token-with-write-access>"
pnpm run rollout:baseline -- --owner Trancendos --min-risk-score 30 --apply
```

Current environment apply attempt evidence:
- `reports/security-baseline-rollout-wave1-apply.json`
- `reports/security-baseline-rollout-wave1-apply.md`
- `reports/security-baseline-rollout-wave1-apply.csv`

Result: write operations blocked by token permissions (`HTTP 403 Resource not accessible by integration`).

Optional controls:

```bash
# target explicit repositories
pnpm run rollout:baseline -- --owner Trancendos --repos secrets-portal,norman-ai --apply

# include forks
pnpm run rollout:baseline -- --owner Trancendos --include-forks --apply
```

## Branching convention

Default branch name used for rollout:

- `security/baseline-hardening-20260222`

Override if needed:

```bash
pnpm run rollout:baseline -- --owner Trancendos --branch security/baseline-hardening-wave2 --apply
```
