# Security Policy

## Supported Versions

This repository follows an active maintenance policy:

- `main` branch: fully supported
- Release branches (`release/*`): critical security fixes only

## Reporting a Vulnerability

If you discover a vulnerability:

1. **Do not** open a public issue with exploit details.
2. Report privately via GitHub Security Advisories (preferred) or direct maintainer contact.
3. Include reproduction steps, impacted versions, and suggested mitigation when possible.

## Response Targets

- Initial triage: within **24 hours**
- Severity assessment: within **72 hours**
- Critical/high mitigation target: within **7 days**
- Medium mitigation target: within **30 days**

## Preventive Controls in This Repository

- Dependabot update automation (`.github/dependabot.yml`)
- Pull request dependency review gating
- Scheduled CVE scanning and N-0/N-1 compliance checks
- Trivy filesystem vulnerability scanning
- CodeQL static analysis
