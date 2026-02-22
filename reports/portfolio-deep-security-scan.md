# Portfolio Deep Security Scan (Trancendos)

Generated: 2026-02-22T18:50:08.716Z

## Summary

- Total repositories assessed: **95**
- Repositories with potential committed secret/key files: **1**
- Repositories with unpinned GitHub Actions: **36**
- Repositories with wildcard/unpinned dependency specs: **13**
- Repositories missing lockfiles: **49**
- Repositories with risky install scripts: **0**
- Repositories with Docker root-user risk: **16**
- Repositories without detected tests: **67**
- Repositories with governance gaps: **94**

## Top Priority Repositories

| Repository | Risk Score | Stack | Key signals |
|---|---:|---|---|
| [opencode](https://github.com/Trancendos/opencode) | 56 | node, rust, container | unpinned-actions:47, missing-lockfile:20, gov-gaps:2 |
| [secrets-portal](https://github.com/Trancendos/secrets-portal) | 52 | node, jvm | secrets:1, unpinned-actions:10, missing-lockfile:2, no-tests, gov-gaps:2 |
| [qodo-cover](https://github.com/Trancendos/qodo-cover) | 50 | node, python, go, jvm, ruby, container | unpinned-actions:28, missing-lockfile:2, gov-gaps:4 |
| [norman-ai](https://github.com/Trancendos/norman-ai) | 44 | node | unpinned-actions:6, missing-lockfile:1, no-tests, gov-gaps:6 |
| [uv-docker-example](https://github.com/Trancendos/uv-docker-example) | 43 | python, container | unpinned-actions:10, no-tests, gov-gaps:5 |
| [qodo-ci-example](https://github.com/Trancendos/qodo-ci-example) | 43 | node, python, go, jvm, php, container | unpinned-actions:21, gov-gaps:5 |
| [dependabot-core](https://github.com/Trancendos/dependabot-core) | 43 | node, python, go, rust, jvm, ruby, php, container, terraform | unpinned-actions:1, wildcard-deps:2, missing-lockfile:12, gov-gaps:1 |
| [agent-starter-pack](https://github.com/Trancendos/agent-starter-pack) | 42 | node, python, go, jvm, container | unpinned-actions:12, gov-gaps:4 |
| [scale-institutional-knowledge-using-copilot-spaces](https://github.com/Trancendos/scale-institutional-knowledge-using-copilot-spaces) | 40 | unknown | unpinned-actions:30, no-tests, gov-gaps:4 |
| [vertex-ai-creative-studio](https://github.com/Trancendos/vertex-ai-creative-studio) | 39 | node, python, go, container, terraform | unpinned-actions:4, missing-lockfile:4, gov-gaps:3 |
| [pr-agent](https://github.com/Trancendos/pr-agent) | 39 | python, container | unpinned-actions:11, gov-gaps:3 |
| [adk-samples](https://github.com/Trancendos/adk-samples) | 39 | node, python, go, jvm, container, terraform | unpinned-actions:14, missing-lockfile:1, gov-gaps:2 |
| [engine-core](https://github.com/Trancendos/engine-core) | 38 | node, container | no-tests, gov-gaps:5 |
| [test-with-actions](https://github.com/Trancendos/test-with-actions) | 37 | unknown | unpinned-actions:20, no-tests, gov-gaps:3 |
| [exercise-toolkit](https://github.com/Trancendos/exercise-toolkit) | 37 | unknown | unpinned-actions:22, no-tests, gov-gaps:3 |
| [the-treasury](https://github.com/Trancendos/the-treasury) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |
| [the-sanctuary](https://github.com/Trancendos/the-sanctuary) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |
| [the-observatory](https://github.com/Trancendos/the-observatory) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |
| [the-nexus](https://github.com/Trancendos/the-nexus) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |
| [the-lighthouse](https://github.com/Trancendos/the-lighthouse) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |
| [the-library](https://github.com/Trancendos/the-library) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |
| [the-ice-box](https://github.com/Trancendos/the-ice-box) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |
| [the-hive](https://github.com/Trancendos/the-hive) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |
| [the-foundation](https://github.com/Trancendos/the-foundation) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |
| [the-forge](https://github.com/Trancendos/the-forge) | 32 | node | missing-lockfile:1, no-tests, gov-gaps:6 |

## Recommended Immediate Actions

1. Rotate/replace any credentials linked to committed secret material.
2. Pin all GitHub Actions to commit SHAs.
3. Eliminate wildcard/remote dependency sources and enforce lockfiles.
4. Add non-root container users and baseline tests where missing.
5. Apply governance baseline controls to all active repositories.
