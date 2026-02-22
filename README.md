# arcadia

Community platform and marketplace

## Part of Luminous-MastermindAI Ecosystem

## Integration Model

This repository is intentionally modular and can operate standalone.
`@trancendos/shared-core` is treated as an optional integration dependency (peer) so Arcadia can run independently while integrating shared contracts when available.

## Installation

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

## Security and Compliance

```bash
pnpm run audit:cve
pnpm run check:n-1
pnpm run audit:repos -- --owner Trancendos --limit 200
```

- CVE scanning and compliance workflows are configured under `.github/workflows/`.
- Dependency update automation is configured via `.github/dependabot.yml`.
- Security response policy is documented in `SECURITY.md`.

## License

MIT © Trancendos
