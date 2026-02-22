#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return fallback;
  }
  return process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function runGh(args, { allowFailure = false } = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 30 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`gh ${args.join(" ")} failed: ${(result.stderr || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

function b64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

function encodePath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function getTagCommitSha(fullRepo, tag) {
  const refRaw = runGh(["api", `repos/${fullRepo}/git/ref/tags/${encodeURIComponent(tag)}`], {
    allowFailure: true,
  });
  const ref = parseJson(refRaw, null);
  if (ref?.object?.sha) {
    if (ref.object.type === "commit") return ref.object.sha;
    if (ref.object.type === "tag") {
      const tagRaw = runGh(["api", `repos/${fullRepo}/git/tags/${ref.object.sha}`], {
        allowFailure: true,
      });
      const tagObj = parseJson(tagRaw, null);
      if (tagObj?.object?.sha) return tagObj.object.sha;
    }
  }

  const tagsRaw = runGh(["api", `repos/${fullRepo}/tags?per_page=100`], { allowFailure: true });
  const tags = parseJson(tagsRaw, []);
  if (!Array.isArray(tags) || tags.length === 0) return null;

  const exact = tags.find((entry) => entry.name === tag);
  if (exact?.commit?.sha) return exact.commit.sha;

  const majorPrefix = `${tag}.`;
  const prefixed = tags.find((entry) => String(entry.name || "").startsWith(majorPrefix));
  if (prefixed?.commit?.sha) return prefixed.commit.sha;

  return null;
}

function fileExists(owner, repo, path, ref) {
  const raw = runGh(
    ["api", `repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`],
    { allowFailure: true }
  );
  if (!raw) return false;
  const data = parseJson(raw, null);
  return Boolean(data && !Array.isArray(data));
}

function createBranchIfNeeded(owner, repo, baseBranch, newBranch) {
  const existing = runGh(
    ["api", `repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(newBranch)}`],
    { allowFailure: true }
  );
  if (existing) return { created: false };

  const baseRefRaw = runGh(["api", `repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`]);
  const baseRef = parseJson(baseRefRaw, null);
  const sha = baseRef?.object?.sha;
  if (!sha) {
    throw new Error(`Unable to resolve base sha for ${owner}/${repo}@${baseBranch}`);
  }

  runGh([
    "api",
    `repos/${owner}/${repo}/git/refs`,
    "-X",
    "POST",
    "-f",
    `ref=refs/heads/${newBranch}`,
    "-f",
    `sha=${sha}`,
  ]);

  return { created: true };
}

function putFile(owner, repo, branch, path, message, content) {
  runGh([
    "api",
    `repos/${owner}/${repo}/contents/${encodePath(path)}`,
    "-X",
    "PUT",
    "-f",
    `message=${message}`,
    "-f",
    `branch=${branch}`,
    "-f",
    `content=${b64(content)}`,
  ]);
}

function openPrIfNeeded(owner, repo, branch, baseBranch, title, body) {
  const existingRaw = runGh(
    [
      "pr",
      "list",
      "--repo",
      `${owner}/${repo}`,
      "--head",
      `${owner}:${branch}`,
      "--base",
      baseBranch,
      "--state",
      "open",
      "--json",
      "url",
    ],
    { allowFailure: true }
  );
  const existing = parseJson(existingRaw, []);
  if (Array.isArray(existing) && existing.length > 0 && existing[0]?.url) {
    return existing[0].url;
  }

  const url = runGh([
    "pr",
    "create",
    "--repo",
    `${owner}/${repo}`,
    "--head",
    branch,
    "--base",
    baseBranch,
    "--title",
    title,
    "--body",
    body,
  ]);
  return url;
}

function isPermissionDeniedError(message) {
  const text = String(message || "");
  return (
    /Resource not accessible by integration/i.test(text) ||
    /HTTP 403/i.test(text) ||
    /forbidden/i.test(text)
  );
}

function buildSecurityMd() {
  return `# Security Policy

## Supported Versions

- \`main\` branch: fully supported
- release branches: critical fixes only

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub Security Advisories.
Do not disclose exploit details in public issues.

## Response Targets

- Initial triage: 24 hours
- Severity assessment: 72 hours
- Critical/high mitigation target: 7 days
- Medium mitigation target: 30 days
`;
}

function buildCodeowners(ownerHandle) {
  return `* @${ownerHandle}\n`;
}

function buildDependabotYaml({ hasNodeRoot, hasPythonRoot }) {
  const lines = [];
  lines.push("version: 2");
  lines.push("updates:");
  lines.push('  - package-ecosystem: "github-actions"');
  lines.push('    directory: "/"');
  lines.push("    schedule:");
  lines.push('      interval: "weekly"');
  lines.push('      day: "monday"');
  lines.push('      time: "03:30"');
  lines.push('      timezone: "UTC"');
  lines.push("    open-pull-requests-limit: 10");
  lines.push("    labels:");
  lines.push('      - "dependencies"');
  lines.push('      - "security"');

  if (hasNodeRoot) {
    lines.push("");
    lines.push('  - package-ecosystem: "npm"');
    lines.push('    directory: "/"');
    lines.push("    schedule:");
    lines.push('      interval: "weekly"');
    lines.push('      day: "monday"');
    lines.push('      time: "04:00"');
    lines.push('      timezone: "UTC"');
    lines.push("    open-pull-requests-limit: 15");
    lines.push("    labels:");
    lines.push('      - "dependencies"');
    lines.push('      - "security"');
  }

  if (hasPythonRoot) {
    lines.push("");
    lines.push('  - package-ecosystem: "pip"');
    lines.push('    directory: "/"');
    lines.push("    schedule:");
    lines.push('      interval: "weekly"');
    lines.push('      day: "monday"');
    lines.push('      time: "04:15"');
    lines.push('      timezone: "UTC"');
    lines.push("    open-pull-requests-limit: 10");
    lines.push("    labels:");
    lines.push('      - "dependencies"');
    lines.push('      - "security"');
  }

  return `${lines.join("\n")}\n`;
}

function buildDependencyReviewWorkflow(actionRefs) {
  return `name: dependency-review

on:
  pull_request:
    branches:
      - main
      - "release/**"

permissions:
  contents: read

jobs:
  dependency-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@${actionRefs.checkout}

      - name: Review dependency changes
        uses: actions/dependency-review-action@${actionRefs.dependencyReview}
        with:
          fail-on-severity: high
          fail-on-scopes: runtime
`;
}

function buildSecurityWorkflow(actionRefs) {
  return `name: security-cve-scan

on:
  pull_request:
    branches:
      - main
      - "release/**"
  push:
    branches:
      - main
  schedule:
    - cron: "23 2 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  trivy-fs:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@${actionRefs.checkout}

      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@${actionRefs.trivy}
        with:
          scan-type: "fs"
          scan-ref: "."
          severity: "HIGH,CRITICAL"
          exit-code: "1"
          ignore-unfixed: true
`;
}

const owner = argValue("--owner", "Trancendos");
const sourceJson = resolve(argValue("--source-json", "reports/portfolio-deep-security-scan.json"));
const outputJson = resolve(argValue("--output-json", "reports/security-baseline-rollout.json"));
const outputMd = resolve(argValue("--output-md", "reports/security-baseline-rollout.md"));
const outputCsv = resolve(argValue("--output-csv", "reports/security-baseline-rollout.csv"));
const branchName = argValue("--branch", "security/baseline-hardening-20260222");
const minRiskScore = Number.parseInt(argValue("--min-risk-score", "30"), 10);
const maxRepos = Number.parseInt(argValue("--max-repos", "999"), 10);
const explicitReposRaw = argValue("--repos", "");
const explicitRepos = new Set(
  explicitReposRaw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);
const includeForks = hasFlag("--include-forks");
const dryRun = !hasFlag("--apply");
const ownerHandle = argValue("--owner-handle", owner);

const data = parseJson(runGh(["api", `repos/${owner}/arcadia`], { allowFailure: true }), null);
if (!data) {
  // noop; ensures token and owner validity before expensive operations
}

const scanData = parseJson(runGh(["api", "rate_limit"], { allowFailure: true }), null);
if (!scanData) {
  // noop
}

const reportSource = parseJson(
  (() => {
    try {
      return readFileSync(sourceJson, "utf8");
    } catch {
      return "";
    }
  })(),
  null
);
if (!reportSource || !Array.isArray(reportSource.repositories)) {
  throw new Error(`Unable to load source scan file: ${sourceJson}`);
}

const targets = reportSource.repositories
  .filter((repo) => repo.riskScore >= minRiskScore)
  .filter((repo) => !repo.isArchived)
  .filter((repo) => includeForks || !repo.isFork)
  .filter((repo) => explicitRepos.size === 0 || explicitRepos.has(repo.name))
  .filter((repo) => (repo.governanceMissingControls || []).length > 0)
  .filter((repo) => repo.name !== "arcadia")
  .sort((a, b) => b.riskScore - a.riskScore)
  .slice(0, maxRepos);

const checkoutSha = getTagCommitSha("actions/checkout", "v4") ?? "v4";
const dependencyReviewSha = getTagCommitSha("actions/dependency-review-action", "v4") ?? "v4";
const trivySha = getTagCommitSha("aquasecurity/trivy-action", "0.31.0") ?? "0.31.0";

const actionRefs = {
  checkout: checkoutSha,
  dependencyReview: dependencyReviewSha,
  trivy: trivySha,
};

const results = [];
for (const repo of targets) {
  const repoName = repo.name;
  const defaultBranch = repo.defaultBranch || "main";
  const stack = Array.isArray(repo.stack) ? repo.stack : [];

  const filesToCreate = [];
  const hasNodeRoot = fileExists(owner, repoName, "package.json", defaultBranch);
  const hasPythonRoot =
    fileExists(owner, repoName, "pyproject.toml", defaultBranch) ||
    fileExists(owner, repoName, "requirements.txt", defaultBranch);

  if (!fileExists(owner, repoName, "SECURITY.md", defaultBranch)) {
    filesToCreate.push({
      path: "SECURITY.md",
      message: "chore(security): add SECURITY.md policy baseline",
      content: buildSecurityMd(),
    });
  }

  if (
    !fileExists(owner, repoName, ".github/CODEOWNERS", defaultBranch) &&
    !fileExists(owner, repoName, "CODEOWNERS", defaultBranch)
  ) {
    filesToCreate.push({
      path: ".github/CODEOWNERS",
      message: "chore(governance): add CODEOWNERS baseline",
      content: buildCodeowners(ownerHandle),
    });
  }

  if (
    !fileExists(owner, repoName, ".github/dependabot.yml", defaultBranch) &&
    !fileExists(owner, repoName, ".github/dependabot.yaml", defaultBranch)
  ) {
    filesToCreate.push({
      path: ".github/dependabot.yml",
      message: "chore(deps): add dependabot baseline",
      content: buildDependabotYaml({ hasNodeRoot, hasPythonRoot }),
    });
  }

  const hasAnyWorkflow =
    fileExists(owner, repoName, ".github/workflows/dependency-review.yml", defaultBranch) ||
    fileExists(owner, repoName, ".github/workflows/dependency-review.yaml", defaultBranch);
  if (!hasAnyWorkflow) {
    filesToCreate.push({
      path: ".github/workflows/dependency-review.yml",
      message: "chore(ci): add dependency review workflow",
      content: buildDependencyReviewWorkflow(actionRefs),
    });
  }

  const hasSecurityWorkflow =
    fileExists(owner, repoName, ".github/workflows/security-cve-scan.yml", defaultBranch) ||
    fileExists(owner, repoName, ".github/workflows/security-cve-scan.yaml", defaultBranch) ||
    fileExists(owner, repoName, ".github/workflows/security-cve-and-compliance.yml", defaultBranch) ||
    fileExists(owner, repoName, ".github/workflows/codeql.yml", defaultBranch);
  if (!hasSecurityWorkflow) {
    filesToCreate.push({
      path: ".github/workflows/security-cve-scan.yml",
      message: "chore(security): add scheduled CVE scanning workflow",
      content: buildSecurityWorkflow(actionRefs),
    });
  }

  const row = {
    repository: repoName,
    riskScore: repo.riskScore,
    isFork: repo.isFork,
    stack,
    defaultBranch,
    filesPlanned: filesToCreate.map((file) => file.path),
    filesApplied: [],
    prUrl: null,
    status: "skipped",
    reason: "",
  };

  if (filesToCreate.length === 0) {
    row.status = "no_changes_needed";
    results.push(row);
    continue;
  }

  try {
    if (!dryRun) {
      createBranchIfNeeded(owner, repoName, defaultBranch, branchName);
      for (const file of filesToCreate) {
        putFile(owner, repoName, branchName, file.path, file.message, file.content);
        row.filesApplied.push(file.path);
      }

      const prBody = [
        "## Summary",
        "",
        "Applies a baseline security/governance hardening package from the portfolio remediation rollout:",
        "",
        ...filesToCreate.map((file) => `- add \`${file.path}\``),
        "",
        "## Why",
        "",
        "- reduce security and governance drift",
        "- establish CVE/dependency checks",
        "- standardize owner and disclosure controls",
      ].join("\n");

      row.prUrl = openPrIfNeeded(
        owner,
        repoName,
        branchName,
        defaultBranch,
        "chore(security): apply baseline hardening controls",
        prBody
      );
      row.status = "applied";
    } else {
      row.status = "dry_run";
    }
  } catch (error) {
    row.reason = String(error.message || error);
    row.status = isPermissionDeniedError(row.reason) ? "permission_denied" : "failed";
  }

  results.push(row);
}

const summary = {
  generatedAt: new Date().toISOString(),
  owner,
  minRiskScore,
  includeForks,
  dryRun,
  branchName,
  targetedRepositories: targets.length,
  applied: results.filter((row) => row.status === "applied").length,
  dryRunCount: results.filter((row) => row.status === "dry_run").length,
  noChangesNeeded: results.filter((row) => row.status === "no_changes_needed").length,
  permissionDenied: results.filter((row) => row.status === "permission_denied").length,
  failed: results.filter((row) => row.status === "failed").length,
};

const report = {
  summary,
  actionRefs,
  results,
};

mkdirSync(dirname(outputJson), { recursive: true });
writeFileSync(outputJson, JSON.stringify(report, null, 2));

const mdLines = [];
mdLines.push("# Security Baseline Rollout");
mdLines.push("");
mdLines.push(`Generated: ${summary.generatedAt}`);
mdLines.push("");
mdLines.push("## Summary");
mdLines.push("");
mdLines.push(`- Owner: **${summary.owner}**`);
mdLines.push(`- Min risk score: **${summary.minRiskScore}**`);
mdLines.push(`- Dry run: **${summary.dryRun}**`);
mdLines.push(`- Targeted repositories: **${summary.targetedRepositories}**`);
mdLines.push(`- Applied: **${summary.applied}**`);
mdLines.push(`- No changes needed: **${summary.noChangesNeeded}**`);
mdLines.push(`- Permission denied: **${summary.permissionDenied}**`);
mdLines.push(`- Failed: **${summary.failed}**`);
mdLines.push("");
mdLines.push("## Action refs used");
mdLines.push("");
mdLines.push(`- actions/checkout: \`${actionRefs.checkout}\``);
mdLines.push(`- actions/dependency-review-action: \`${actionRefs.dependencyReview}\``);
mdLines.push(`- aquasecurity/trivy-action: \`${actionRefs.trivy}\``);
mdLines.push("");
mdLines.push("## Repository Results");
mdLines.push("");
mdLines.push("| Repository | Status | Planned files | PR |");
mdLines.push("|---|---|---|---|");
for (const row of results) {
  mdLines.push(
    `| ${row.repository} | ${row.status} | ${row.filesPlanned.join(", ") || "none"} | ${row.prUrl ?? ""} |`
  );
}
mdLines.push("");

if (summary.permissionDenied > 0) {
  mdLines.push("## Permission Constraints");
  mdLines.push("");
  mdLines.push(
    "This environment token can read repositories but cannot create branches or PRs in sibling repositories."
  );
  mdLines.push(
    "Re-run this script in a privileged environment with `contents:write` and `pull_requests:write` access."
  );
  mdLines.push("");
}

mkdirSync(dirname(outputMd), { recursive: true });
writeFileSync(outputMd, mdLines.join("\n"));

const csvLines = [];
csvLines.push(
  [
    "repository",
    "status",
    "risk_score",
    "default_branch",
    "files_planned_count",
    "files_planned",
    "pr_url",
    "reason",
  ].join(",")
);
for (const row of results) {
  csvLines.push(
    [
      row.repository,
      row.status,
      String(row.riskScore ?? ""),
      row.defaultBranch,
      String(row.filesPlanned.length),
      `"${row.filesPlanned.join(" | ").replace(/"/g, "'")}"`,
      row.prUrl ? `"${row.prUrl}"` : "",
      row.reason ? `"${row.reason.replace(/"/g, "'")}"` : "",
    ].join(",")
  );
}
mkdirSync(dirname(outputCsv), { recursive: true });
writeFileSync(outputCsv, csvLines.join("\n"));

console.log(`Rollout report written to ${outputJson}`);
console.log(`Rollout summary written to ${outputMd}`);
console.log(`Rollout CSV written to ${outputCsv}`);
