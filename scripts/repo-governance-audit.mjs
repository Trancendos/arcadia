#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
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

function runGh(args, { allowFailure = false } = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (allowFailure) {
      return null;
    }
    throw new Error(`gh ${args.join(" ")} failed: ${(result.stderr || "").trim()}`);
  }

  return result.stdout.trim();
}

function runGit(args, fallback = "") {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    return fallback;
  }
  return (result.stdout || "").trim();
}

function detectOwner() {
  const remote = runGit(["remote", "get-url", "origin"], "");
  const match = remote.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
  return match ? match[1] : "Trancendos";
}

function parseJson(raw, fallback) {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function listDir(owner, repo, path) {
  const endpoint = path
    ? `repos/${owner}/${repo}/contents/${path}`
    : `repos/${owner}/${repo}/contents`;

  const raw = runGh(["api", endpoint], { allowFailure: true });
  const data = parseJson(raw, null);

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((entry) => ({
    name: entry.name,
    path: entry.path,
    type: entry.type,
  }));
}

function hasAnyName(entries, candidates) {
  const lower = new Set(entries.map((entry) => String(entry.name).toLowerCase()));
  return candidates.some((name) => lower.has(name.toLowerCase()));
}

function inferStack(rootEntries) {
  const names = new Set(rootEntries.map((entry) => entry.name));
  const stack = [];

  if (names.has("package.json")) stack.push("node");
  if (names.has("pyproject.toml") || names.has("requirements.txt")) stack.push("python");
  if (names.has("go.mod")) stack.push("go");
  if (names.has("Cargo.toml")) stack.push("rust");
  if (names.has("pom.xml") || names.has("build.gradle") || names.has("build.gradle.kts")) {
    stack.push("jvm");
  }
  if (names.has("Gemfile")) stack.push("ruby");
  if (names.has("composer.json")) stack.push("php");
  if (names.has("Dockerfile") || names.has("docker-compose.yml")) stack.push("container");
  if (names.has("main.tf") || names.has("terraform.tfvars")) stack.push("terraform");

  return stack.length > 0 ? stack : ["unknown"];
}

const owner = argValue("--owner", process.env.GITHUB_OWNER || detectOwner());
const limit = Number.parseInt(argValue("--limit", "200"), 10);
const outputJson = resolve(argValue("--output-json", "reports/repo-governance-audit.json"));
const outputMd = resolve(argValue("--output-md", "reports/repo-governance-audit.md"));
const silent = hasFlag("--silent");

if (!silent) {
  console.log(`Running governance audit for ${owner} (limit=${limit})`);
}

const reposRaw = runGh([
  "repo",
  "list",
  owner,
  "--limit",
  String(limit),
  "--json",
  "name,description,url,updatedAt,isPrivate,defaultBranchRef",
]);

const repos = parseJson(reposRaw, []);
if (!Array.isArray(repos) || repos.length === 0) {
  throw new Error(`No repositories discovered for ${owner}`);
}

const findings = [];
for (const repo of repos) {
  const name = repo.name;

  const rootEntries = listDir(owner, name, "");
  const githubEntries = listDir(owner, name, ".github");
  const workflowEntries = listDir(owner, name, ".github/workflows");

  const hasSecurityPolicy =
    hasAnyName(rootEntries, ["SECURITY.md"]) || hasAnyName(githubEntries, ["SECURITY.md"]);
  const hasDependabot = hasAnyName(githubEntries, ["dependabot.yml", "dependabot.yaml"]);
  const hasCodeowners =
    hasAnyName(rootEntries, ["CODEOWNERS"]) || hasAnyName(githubEntries, ["CODEOWNERS"]);
  const hasCiWorkflow = workflowEntries.some((entry) => entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"));
  const hasSecurityWorkflow = workflowEntries.some((entry) =>
    /(security|codeql|cve|trivy|osv|audit)/i.test(entry.name)
  );
  const hasLicense = hasAnyName(rootEntries, ["LICENSE", "LICENSE.md"]);

  const controls = {
    securityPolicy: hasSecurityPolicy,
    dependabot: hasDependabot,
    codeowners: hasCodeowners,
    ciWorkflow: hasCiWorkflow,
    securityWorkflow: hasSecurityWorkflow,
    license: hasLicense,
  };

  const missingControls = Object.entries(controls)
    .filter(([, passed]) => !passed)
    .map(([control]) => control);

  const stack = inferStack(rootEntries);
  const rootEntryCount = rootEntries.length;
  const workflowCount = workflowEntries.length;
  const isLikelySkeleton =
    rootEntryCount <= 4 &&
    stack.includes("node") &&
    !hasCiWorkflow &&
    !hasDependabot &&
    !hasSecurityPolicy;

  findings.push({
    name,
    url: repo.url,
    description: repo.description ?? "",
    updatedAt: repo.updatedAt,
    isPrivate: repo.isPrivate,
    defaultBranch: repo.defaultBranchRef?.name ?? "main",
    stack,
    rootEntryCount,
    workflowCount,
    isLikelySkeleton,
    controls,
    missingControls,
    completionScore: Number((((6 - missingControls.length) / 6) * 100).toFixed(1)),
  });
}

const totals = findings.reduce(
  (acc, repo) => {
    acc.totalRepos += 1;
    acc.likelySkeletonRepos += repo.isLikelySkeleton ? 1 : 0;
    acc.missing.securityPolicy += repo.controls.securityPolicy ? 0 : 1;
    acc.missing.dependabot += repo.controls.dependabot ? 0 : 1;
    acc.missing.codeowners += repo.controls.codeowners ? 0 : 1;
    acc.missing.ciWorkflow += repo.controls.ciWorkflow ? 0 : 1;
    acc.missing.securityWorkflow += repo.controls.securityWorkflow ? 0 : 1;
    acc.missing.license += repo.controls.license ? 0 : 1;
    return acc;
  },
  {
    totalRepos: 0,
    likelySkeletonRepos: 0,
    missing: {
      securityPolicy: 0,
      dependabot: 0,
      codeowners: 0,
      ciWorkflow: 0,
      securityWorkflow: 0,
      license: 0,
    },
  }
);

const completionBaseline = Number(
  (
    (findings.reduce((sum, repo) => sum + repo.completionScore, 0) / findings.length || 0)
  ).toFixed(1)
);

const prioritized = [...findings]
  .sort((a, b) => a.completionScore - b.completionScore)
  .slice(0, 25);

const report = {
  generatedAt: new Date().toISOString(),
  owner,
  limit,
  summary: {
    totalRepos: totals.totalRepos,
    likelySkeletonRepos: totals.likelySkeletonRepos,
    completionBaseline,
    missingControls: totals.missing,
  },
  worstRepositories: prioritized,
  repositories: findings,
};

mkdirSync(dirname(outputJson), { recursive: true });
writeFileSync(outputJson, JSON.stringify(report, null, 2));

const mdLines = [];
mdLines.push(`# Repository Governance Audit (${owner})`);
mdLines.push("");
mdLines.push(`Generated: ${report.generatedAt}`);
mdLines.push("");
mdLines.push("## Summary");
mdLines.push("");
mdLines.push(`- Total repositories assessed: **${totals.totalRepos}**`);
mdLines.push(`- Likely skeleton/placeholder repos: **${totals.likelySkeletonRepos}**`);
mdLines.push(`- Governance completion baseline: **${completionBaseline}%**`);
mdLines.push(`- Missing SECURITY.md: **${totals.missing.securityPolicy}** repos`);
mdLines.push(`- Missing Dependabot: **${totals.missing.dependabot}** repos`);
mdLines.push(`- Missing CODEOWNERS: **${totals.missing.codeowners}** repos`);
mdLines.push(`- Missing CI workflow: **${totals.missing.ciWorkflow}** repos`);
mdLines.push(`- Missing security/CVE workflow: **${totals.missing.securityWorkflow}** repos`);
mdLines.push(`- Missing LICENSE: **${totals.missing.license}** repos`);
mdLines.push("");
mdLines.push("## Highest-Risk Repositories (lowest completion first)");
mdLines.push("");
mdLines.push("| Repository | Stack | Completion | Missing controls |");
mdLines.push("|---|---|---:|---|");
for (const repo of prioritized) {
  mdLines.push(
    `| [${repo.name}](${repo.url}) | ${repo.stack.join(", ")} | ${repo.completionScore}% | ${repo.missingControls.join(", ") || "none"} |`
  );
}
mdLines.push("");
mdLines.push("## Next Step");
mdLines.push("");
mdLines.push(
  "Use this report as a baseline to enforce N-0/N-1 dependency policy, add security workflows, and standardize modular contracts across repositories."
);
mdLines.push("");

mkdirSync(dirname(outputMd), { recursive: true });
writeFileSync(outputMd, mdLines.join("\n"));

if (!silent) {
  console.log(`Audit report written to ${outputJson}`);
  console.log(`Summary report written to ${outputMd}`);
}
