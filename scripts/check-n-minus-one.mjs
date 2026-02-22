#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseMajor(version) {
  const match = String(version ?? "").match(/(\d+)(?:\.\d+)?(?:\.\d+)?/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function runOutdated() {
  const result = spawnSync("npm", ["outdated", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    return {};
  }

  if (result.status === 1) {
    const output = (result.stdout ?? "").trim();
    if (!output) {
      return {};
    }
    return JSON.parse(output);
  }

  const stderr = (result.stderr ?? "").trim();
  throw new Error(`npm outdated failed (${result.status}): ${stderr}`);
}

try {
  const outdated = runOutdated();
  const violations = [];
  const nMinusOne = [];
  const unknown = [];

  for (const [pkg, meta] of Object.entries(outdated)) {
    const currentMajor = parseMajor(meta.current);
    const latestMajor = parseMajor(meta.latest);

    if (currentMajor === null || latestMajor === null) {
      unknown.push({ pkg, current: meta.current, latest: meta.latest });
      continue;
    }

    const lag = latestMajor - currentMajor;
    if (lag > 1) {
      violations.push({
        pkg,
        current: meta.current,
        latest: meta.latest,
        lag,
      });
    } else if (lag === 1) {
      nMinusOne.push({ pkg, current: meta.current, latest: meta.latest });
    }
  }

  if (Object.keys(outdated).length === 0) {
    console.log("N-0 compliance: all dependencies are current.");
    process.exit(0);
  }

  if (violations.length > 0) {
    console.error("N-0/N-1 compliance violation(s) found:");
    for (const item of violations) {
      console.error(
        `- ${item.pkg}: current=${item.current}, latest=${item.latest} (major lag=${item.lag})`
      );
    }

    if (nMinusOne.length > 0) {
      console.error("\nN-1 (acceptable but upgrade recommended):");
      for (const item of nMinusOne) {
        console.error(`- ${item.pkg}: current=${item.current}, latest=${item.latest}`);
      }
    }

    process.exit(1);
  }

  if (nMinusOne.length > 0) {
    console.log("N-1 compliance: no package is more than one major behind.");
    for (const item of nMinusOne) {
      console.log(`- ${item.pkg}: current=${item.current}, latest=${item.latest}`);
    }
  } else {
    console.log("N-0 compliance: no outdated major versions detected.");
  }

  if (unknown.length > 0) {
    console.log("\nSkipped entries with non-semver versions:");
    for (const item of unknown) {
      console.log(`- ${item.pkg}: current=${item.current}, latest=${item.latest}`);
    }
  }

  process.exit(0);
} catch (error) {
  console.error(`Failed to evaluate N-0/N-1 compliance: ${error.message}`);
  process.exit(2);
}
