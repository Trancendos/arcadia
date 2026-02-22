#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
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
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function runGh(args, { allowFailure = false, suppressStderr = false } = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 30 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (allowFailure) {
      return null;
    }
    const stderr = suppressStderr ? "" : (result.stderr || "").trim();
    throw new Error(`gh ${args.join(" ")} failed (${result.status}) ${stderr}`.trim());
  }

  return (result.stdout || "").trim();
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

function encodeContentPath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function isLikelySecretPath(path) {
  return (
    /(^|\/)\.env(\.|$)/i.test(path) ||
    /(^|\/)(id_rsa|id_dsa|known_hosts)$/i.test(path) ||
    /\.(pem|pfx|p12|jks|keystore|key|crt)$/i.test(path) ||
    /(^|\/)(service-account|credentials?|secrets?)(\.(json|ya?ml|toml|ini|txt|env))$/i.test(path)
  );
}

function isClearlyExamplePath(path) {
  return /(example|sample|template|fixtures?|mocks?|docs?|testdata|tests?)/i.test(path);
}

function inferStack(paths) {
  const names = new Set(paths.map((path) => posix.basename(path)));
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

function loadGovernanceMap(governancePath) {
  if (!existsSync(governancePath)) {
    return new Map();
  }
  const raw = readFileSync(governancePath, "utf8");
  const data = parseJson(raw, null);
  const repos = Array.isArray(data?.repositories) ? data.repositories : [];
  return new Map(
    repos.map((repo) => [
      repo.name,
      {
        completionScore: repo.completionScore,
        missingControls: repo.missingControls ?? [],
      },
    ])
  );
}

function fetchTree(owner, repo, ref) {
  const branch = encodeURIComponent(ref || "main");
  const raw = runGh(["api", `repos/${owner}/${repo}/git/trees/${branch}?recursive=1`], {
    allowFailure: true,
  });
  const data = parseJson(raw, null);
  if (data && Array.isArray(data.tree)) {
    return data.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => ({
        path: entry.path,
        size: entry.size ?? 0,
      }));
  }
  return [];
}

function fetchFile(owner, repo, path, ref) {
  const encodedPath = encodeContentPath(path);
  const endpoint = `repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref || "main")}`;
  const raw = runGh(["api", endpoint], { allowFailure: true, suppressStderr: true });
  const data = parseJson(raw, null);
  if (!data || Array.isArray(data)) {
    return null;
  }
  if (typeof data.content !== "string" || data.encoding !== "base64") {
    return null;
  }
  try {
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function extractUsesReferences(content) {
  const matches = [];
  const regex = /^\s*uses:\s*["']?([^"'\s]+)["']?/gm;
  let result;
  while ((result = regex.exec(content)) !== null) {
    matches.push(result[1]);
  }
  return matches;
}

function isShaPinned(ref) {
  return /^[a-f0-9]{40}$/i.test(ref);
}

function evaluateWorkflowPins(usesRefs) {
  const unpinned = [];
  for (const use of usesRefs) {
    if (use.startsWith("./")) {
      continue;
    }

    if (use.startsWith("docker://")) {
      if (!/@sha256:[a-f0-9]{64}$/i.test(use)) {
        unpinned.push({ use, reason: "docker-tag-not-digest" });
      }
      continue;
    }

    const atIndex = use.lastIndexOf("@");
    if (atIndex === -1) {
      unpinned.push({ use, reason: "no-version-ref" });
      continue;
    }

    const ref = use.slice(atIndex + 1);
    if (!isShaPinned(ref)) {
      unpinned.push({ use, reason: "not-sha-pinned" });
    }
  }
  return unpinned;
}

function isInstallScriptRisky(script) {
  return /(curl|wget|Invoke-WebRequest|powershell|bash\s+-c|sh\s+-c)/i.test(script);
}

function scoreRepository(risk) {
  let score = 0;
  score += Math.min(30, risk.criticalSecretFiles.length * 12);
  score += Math.min(20, risk.unpinnedActions.length * 2);
  score += Math.min(15, risk.wildcardDependencySpecs.length * 5);
  score += Math.min(10, risk.workspaceDependencySpecs.length * 3);
  score += Math.min(10, risk.remoteSourceDependencySpecs.length * 3);
  score += Math.min(15, risk.riskyInstallScripts.length * 7);
  score += Math.min(10, risk.missingLockfilePackages.length * 3);
  score += Math.min(10, risk.dockerfilesWithoutUser.length * 4);
  score += Math.min(5, risk.dockerfilesUsingLatestTag.length * 2);
  if (!risk.hasTests) score += 8;
  score += Math.min(18, risk.governanceMissingControls.length * 3);
  return Math.min(100, score);
}

const owner = argValue("--owner", process.env.GITHUB_OWNER || detectOwner());
const limit = Number.parseInt(argValue("--limit", "200"), 10);
const outputJson = resolve(argValue("--output-json", "reports/portfolio-deep-security-scan.json"));
const outputMd = resolve(argValue("--output-md", "reports/portfolio-deep-security-scan.md"));
const outputCsv = resolve(argValue("--output-csv", "reports/portfolio-remediation-backlog.csv"));
const governancePath = resolve(argValue("--governance-json", "reports/repo-governance-audit.json"));
const silent = hasFlag("--silent");

if (!silent) {
  console.log(`Running deep portfolio scan for ${owner} (limit=${limit})`);
}

const reposRaw = runGh([
  "repo",
  "list",
  owner,
  "--limit",
  String(limit),
  "--json",
  "name,url,description,updatedAt,isPrivate,isArchived,isFork,defaultBranchRef,diskUsage",
]);

const repos = parseJson(reposRaw, []);
if (!Array.isArray(repos) || repos.length === 0) {
  throw new Error(`No repositories discovered for ${owner}`);
}

const governanceMap = loadGovernanceMap(governancePath);
const findings = [];

for (const repo of repos) {
  const repoName = repo.name;
  const ref = repo.defaultBranchRef?.name ?? "main";

  if (!silent) {
    console.log(`- scanning ${repoName}`);
  }

  const treeEntries = fetchTree(owner, repoName, ref);
  const paths = treeEntries.map((entry) => entry.path);
  const stack = inferStack(paths);

  const workflowPaths = paths.filter(
    (path) =>
      path.startsWith(".github/workflows/") &&
      (path.endsWith(".yml") || path.endsWith(".yaml"))
  );
  const packageJsonPaths = paths.filter(
    (path) => path.endsWith("package.json") && !path.includes("node_modules/")
  );
  const lockfilePaths = new Set(
    paths.filter((path) =>
      /(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb|npm-shrinkwrap\.json)$/i.test(path)
    )
  );
  const dockerfilePaths = paths.filter((path) => /(^|\/)Dockerfile(\..*)?$/i.test(path));
  const requirementsPaths = paths.filter(
    (path) =>
      /(^|\/)requirements(\..*)?\.txt$/i.test(path) || /(^|\/)pyproject\.toml$/i.test(path)
  );

  const criticalSecretFiles = paths
    .filter(isLikelySecretPath)
    .filter((path) => !isClearlyExamplePath(path));

  const testFileCount = paths.filter(
    (path) =>
      /(^|\/)(test|tests|spec|specs)\//i.test(path) ||
      /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|cs|php)$/i.test(path)
  ).length;

  const unpinnedActions = [];
  for (const workflowPath of workflowPaths.slice(0, 30)) {
    const content = fetchFile(owner, repoName, workflowPath, ref);
    if (!content) continue;
    const usesRefs = extractUsesReferences(content);
    const issues = evaluateWorkflowPins(usesRefs);
    for (const issue of issues) {
      unpinnedActions.push({
        workflow: workflowPath,
        use: issue.use,
        reason: issue.reason,
      });
    }
  }

  const wildcardDependencySpecs = [];
  const workspaceDependencySpecs = [];
  const remoteSourceDependencySpecs = [];
  const riskyInstallScripts = [];
  const missingLockfilePackages = [];

  for (const packageJsonPath of packageJsonPaths.slice(0, 25)) {
    const content = fetchFile(owner, repoName, packageJsonPath, ref);
    if (!content) continue;
    const pkg = parseJson(content, null);
    if (!pkg || typeof pkg !== "object") continue;

    const dependencySections = [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ];

    for (const section of dependencySections) {
      const deps = pkg[section];
      if (!deps || typeof deps !== "object") continue;
      for (const [depName, rawSpec] of Object.entries(deps)) {
        const spec = String(rawSpec).trim();
        if (spec === "*" || spec.toLowerCase() === "latest") {
          wildcardDependencySpecs.push({ path: packageJsonPath, depName, spec, section });
        }
        if (spec.includes("workspace:")) {
          workspaceDependencySpecs.push({ path: packageJsonPath, depName, spec, section });
        }
        if (/^(git\+|github:|https?:\/\/|ssh:\/\/|git:\/\/)/i.test(spec)) {
          remoteSourceDependencySpecs.push({ path: packageJsonPath, depName, spec, section });
        }
      }
    }

    const scripts = pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
    for (const [scriptName, scriptValue] of Object.entries(scripts)) {
      if (!/(preinstall|install|postinstall|prepare)/i.test(scriptName)) {
        continue;
      }
      const text = String(scriptValue);
      if (isInstallScriptRisky(text)) {
        riskyInstallScripts.push({
          path: packageJsonPath,
          scriptName,
          scriptValue: text,
        });
      }
    }

    const packageDir = posix.dirname(packageJsonPath);
    let cursor = packageDir;
    let covered = false;
    while (true) {
      const base = cursor === "." ? "" : `${cursor}/`;
      if (
        lockfilePaths.has(`${base}pnpm-lock.yaml`) ||
        lockfilePaths.has(`${base}package-lock.json`) ||
        lockfilePaths.has(`${base}yarn.lock`) ||
        lockfilePaths.has(`${base}bun.lockb`) ||
        lockfilePaths.has(`${base}npm-shrinkwrap.json`)
      ) {
        covered = true;
        break;
      }
      if (cursor === "." || cursor === "") {
        break;
      }
      const parent = posix.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    if (!covered) {
      missingLockfilePackages.push(packageJsonPath);
    }
  }

  const unpinnedRequirements = [];
  for (const requirementsPath of requirementsPaths.slice(0, 20)) {
    const content = fetchFile(owner, repoName, requirementsPath, ref);
    if (!content) continue;
    if (requirementsPath.endsWith("pyproject.toml")) {
      const lines = content.split("\n");
      for (const line of lines) {
        if (!/^\s*[\w.-]+\s*=/.test(line)) continue;
        if (/(optional-dependencies|dependency-groups)/i.test(line)) continue;
      }
      continue;
    }

    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-r") || trimmed.startsWith("--")) {
        continue;
      }
      if (!trimmed.includes("==")) {
        unpinnedRequirements.push({ path: requirementsPath, line: trimmed });
      }
    }
  }

  const dockerfilesWithoutUser = [];
  const dockerfilesUsingLatestTag = [];
  for (const dockerfilePath of dockerfilePaths.slice(0, 20)) {
    const content = fetchFile(owner, repoName, dockerfilePath, ref);
    if (!content) continue;
    if (!/\bUSER\b/i.test(content)) {
      dockerfilesWithoutUser.push(dockerfilePath);
    }
    if (/^\s*FROM\s+\S+:latest\b/im.test(content)) {
      dockerfilesUsingLatestTag.push(dockerfilePath);
    }
  }

  const governance = governanceMap.get(repoName) ?? {
    completionScore: null,
    missingControls: [],
  };

  const risk = {
    criticalSecretFiles,
    unpinnedActions,
    wildcardDependencySpecs,
    workspaceDependencySpecs,
    remoteSourceDependencySpecs,
    riskyInstallScripts,
    missingLockfilePackages,
    unpinnedRequirements,
    dockerfilesWithoutUser,
    dockerfilesUsingLatestTag,
    hasTests: testFileCount > 0,
    governanceMissingControls: governance.missingControls ?? [],
  };

  const riskScore = scoreRepository(risk);
  const recommendations = [];
  if (criticalSecretFiles.length > 0) {
    recommendations.push("Remove committed secrets/key material and rotate credentials immediately.");
  }
  if (unpinnedActions.length > 0) {
    recommendations.push("Pin GitHub Actions to immutable commit SHAs.");
  }
  if (wildcardDependencySpecs.length > 0 || unpinnedRequirements.length > 0) {
    recommendations.push("Replace wildcard/unpinned dependency specs with controlled version ranges or exact pins.");
  }
  if (workspaceDependencySpecs.length > 0) {
    recommendations.push("Replace workspace coupling with published internal package versions.");
  }
  if (missingLockfilePackages.length > 0) {
    recommendations.push("Commit lockfiles for all package manager roots and enforce frozen-lockfile installs.");
  }
  if (riskyInstallScripts.length > 0) {
    recommendations.push("Review install-time scripts that fetch/execute remote code.");
  }
  if (dockerfilesWithoutUser.length > 0) {
    recommendations.push("Set non-root USER in Dockerfiles.");
  }
  if (governance.missingControls?.length > 0) {
    recommendations.push("Apply baseline governance controls (SECURITY.md, Dependabot, CODEOWNERS, CI, security workflows).");
  }
  if (!risk.hasTests) {
    recommendations.push("Add at least smoke/unit tests and enforce them in CI.");
  }

  findings.push({
    name: repoName,
    url: repo.url,
    description: repo.description ?? "",
    updatedAt: repo.updatedAt,
    isPrivate: repo.isPrivate,
    isArchived: repo.isArchived,
    isFork: repo.isFork,
    diskUsageKiB: repo.diskUsage ?? null,
    defaultBranch: ref,
    stack,
    governanceCompletionScore: governance.completionScore,
    governanceMissingControls: governance.missingControls ?? [],
    fileCount: paths.length,
    workflowCount: workflowPaths.length,
    packageManifestCount: packageJsonPaths.length,
    riskScore,
    risk,
    recommendations,
  });
}

const summary = findings.reduce(
  (acc, repo) => {
    acc.totalRepositories += 1;
    if (repo.risk.criticalSecretFiles.length > 0) acc.repositoriesWithPotentialSecretFiles += 1;
    if (repo.risk.unpinnedActions.length > 0) acc.repositoriesWithUnpinnedActions += 1;
    if (
      repo.risk.wildcardDependencySpecs.length > 0 ||
      repo.risk.unpinnedRequirements.length > 0
    ) {
      acc.repositoriesWithUnpinnedDependencies += 1;
    }
    if (repo.risk.missingLockfilePackages.length > 0) acc.repositoriesMissingLockfiles += 1;
    if (repo.risk.riskyInstallScripts.length > 0) acc.repositoriesWithRiskyInstallScripts += 1;
    if (repo.risk.dockerfilesWithoutUser.length > 0) acc.repositoriesWithDockerRootRisk += 1;
    if (!repo.risk.hasTests) acc.repositoriesWithoutTests += 1;
    if (repo.risk.governanceMissingControls.length > 0) acc.repositoriesWithGovernanceGaps += 1;
    return acc;
  },
  {
    totalRepositories: 0,
    repositoriesWithPotentialSecretFiles: 0,
    repositoriesWithUnpinnedActions: 0,
    repositoriesWithUnpinnedDependencies: 0,
    repositoriesMissingLockfiles: 0,
    repositoriesWithRiskyInstallScripts: 0,
    repositoriesWithDockerRootRisk: 0,
    repositoriesWithoutTests: 0,
    repositoriesWithGovernanceGaps: 0,
  }
);

const prioritized = [...findings].sort((a, b) => b.riskScore - a.riskScore).slice(0, 40);

const report = {
  generatedAt: new Date().toISOString(),
  owner,
  limit,
  summary,
  prioritizedRepositories: prioritized,
  repositories: findings,
};

mkdirSync(dirname(outputJson), { recursive: true });
writeFileSync(outputJson, JSON.stringify(report, null, 2));

const md = [];
md.push(`# Portfolio Deep Security Scan (${owner})`);
md.push("");
md.push(`Generated: ${report.generatedAt}`);
md.push("");
md.push("## Summary");
md.push("");
md.push(`- Total repositories assessed: **${summary.totalRepositories}**`);
md.push(
  `- Repositories with potential committed secret/key files: **${summary.repositoriesWithPotentialSecretFiles}**`
);
md.push(`- Repositories with unpinned GitHub Actions: **${summary.repositoriesWithUnpinnedActions}**`);
md.push(
  `- Repositories with wildcard/unpinned dependency specs: **${summary.repositoriesWithUnpinnedDependencies}**`
);
md.push(`- Repositories missing lockfiles: **${summary.repositoriesMissingLockfiles}**`);
md.push(`- Repositories with risky install scripts: **${summary.repositoriesWithRiskyInstallScripts}**`);
md.push(`- Repositories with Docker root-user risk: **${summary.repositoriesWithDockerRootRisk}**`);
md.push(`- Repositories without detected tests: **${summary.repositoriesWithoutTests}**`);
md.push(`- Repositories with governance gaps: **${summary.repositoriesWithGovernanceGaps}**`);
md.push("");
md.push("## Top Priority Repositories");
md.push("");
md.push("| Repository | Risk Score | Stack | Key signals |");
md.push("|---|---:|---|---|");
for (const repo of prioritized.slice(0, 25)) {
  const signals = [
    repo.risk.criticalSecretFiles.length > 0 ? `secrets:${repo.risk.criticalSecretFiles.length}` : null,
    repo.risk.unpinnedActions.length > 0 ? `unpinned-actions:${repo.risk.unpinnedActions.length}` : null,
    repo.risk.wildcardDependencySpecs.length > 0 ? `wildcard-deps:${repo.risk.wildcardDependencySpecs.length}` : null,
    repo.risk.missingLockfilePackages.length > 0 ? `missing-lockfile:${repo.risk.missingLockfilePackages.length}` : null,
    !repo.risk.hasTests ? "no-tests" : null,
    repo.governanceMissingControls.length > 0 ? `gov-gaps:${repo.governanceMissingControls.length}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  md.push(
    `| [${repo.name}](${repo.url}) | ${repo.riskScore} | ${repo.stack.join(", ")} | ${signals || "none"} |`
  );
}
md.push("");
md.push("## Recommended Immediate Actions");
md.push("");
md.push("1. Rotate/replace any credentials linked to committed secret material.");
md.push("2. Pin all GitHub Actions to commit SHAs.");
md.push("3. Eliminate wildcard/remote dependency sources and enforce lockfiles.");
md.push("4. Add non-root container users and baseline tests where missing.");
md.push("5. Apply governance baseline controls to all active repositories.");
md.push("");

mkdirSync(dirname(outputMd), { recursive: true });
writeFileSync(outputMd, md.join("\n"));

const csvLines = [];
csvLines.push(
  [
    "repository",
    "risk_score",
    "priority",
    "stack",
    "governance_gap_count",
    "secret_files",
    "unpinned_actions",
    "unpinned_dependencies",
    "missing_lockfiles",
    "docker_root_risk",
    "has_tests",
    "recommended_actions",
  ].join(",")
);

for (const repo of [...findings].sort((a, b) => b.riskScore - a.riskScore)) {
  const priority =
    repo.riskScore >= 45 ? "P0" : repo.riskScore >= 35 ? "P1" : repo.riskScore >= 25 ? "P2" : "P3";
  const dependencySignals =
    repo.risk.wildcardDependencySpecs.length + repo.risk.unpinnedRequirements.length;
  const recommended = repo.recommendations.join(" | ").replace(/"/g, "'").replace(/\n/g, " ");
  const row = [
    repo.name,
    String(repo.riskScore),
    priority,
    `"${repo.stack.join("+")}"`,
    String(repo.governanceMissingControls.length),
    String(repo.risk.criticalSecretFiles.length),
    String(repo.risk.unpinnedActions.length),
    String(dependencySignals),
    String(repo.risk.missingLockfilePackages.length),
    String(repo.risk.dockerfilesWithoutUser.length),
    repo.risk.hasTests ? "true" : "false",
    `"${recommended}"`,
  ];
  csvLines.push(row.join(","));
}

mkdirSync(dirname(outputCsv), { recursive: true });
writeFileSync(outputCsv, csvLines.join("\n"));

if (!silent) {
  console.log(`Deep scan report written to ${outputJson}`);
  console.log(`Summary report written to ${outputMd}`);
  console.log(`Remediation backlog written to ${outputCsv}`);
}
