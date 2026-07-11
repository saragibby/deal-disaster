#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreSrc = path.join(repoRoot, 'packages/property-analyzer-core/src');
const corePackage = path.join(repoRoot, 'packages/property-analyzer-core');
const legacySrc = path.join(repoRoot, 'src');

const args = process.argv.slice(2);
const baseArgIndex = args.indexOf('--base');
const explicitBase = baseArgIndex >= 0 ? args[baseArgIndex + 1] : undefined;

const forbiddenPackages = [
  {
    pattern: /^@deal-platform\/shared-auth(?:\/|$)/,
    category: 'shared-auth globals',
    reason: 'core must receive auth/API behavior through adapters, not AuthProvider/useAuth/api/localStorage-backed globals.',
  },
  {
    pattern: /^@deal-platform\/shared-ui(?:\/|$)/,
    category: 'platform shell UI',
    reason: 'core must not depend on AppShell, shared navigation, or dashboard-owned UI chrome.',
  },
  {
    pattern: /^(apps|server|src)(?:\/|$)/,
    category: 'workspace app/server/legacy import',
    reason: 'core cannot import app wrappers, server routes, or the deprecated top-level src game copy.',
  },
];

const forbiddenResolvedPaths = [
  {
    test: (resolvedPath) => isWithin(resolvedPath, path.join(repoRoot, 'apps')),
    category: 'app wrapper import',
    reason: 'core cannot import dashboard/property-analyzer app code; wrappers depend on core, not the reverse.',
  },
  {
    test: (resolvedPath) => isWithin(resolvedPath, path.join(repoRoot, 'packages/shared-auth')),
    category: 'shared-auth relative import',
    reason: 'core must receive auth/API behavior through adapters.',
  },
  {
    test: (resolvedPath) => isWithin(resolvedPath, path.join(repoRoot, 'packages/shared-ui')),
    category: 'platform shell relative import',
    reason: 'core must not depend on platform shell UI.',
  },
  {
    test: (resolvedPath) => isWithin(resolvedPath, path.join(repoRoot, 'server')),
    category: 'server import',
    reason: 'core cannot depend on Express routes, middleware, or server-only services.',
  },
  {
    test: (resolvedPath) => isWithin(resolvedPath, legacySrc),
    category: 'legacy src import',
    reason: 'top-level src is a deprecated game copy and is off-limits for Property Analyzer extraction work.',
  },
];

const forbiddenCodePatterns = [
  {
    pattern: /\b(?:localStorage|sessionStorage)\b/,
    category: 'browser storage global',
    reason: 'core must not assume dashboard/auth token storage; pass persisted state through adapters.',
  },
  {
    pattern: /\bdocument\.cookie\b/,
    category: 'auth cookie global',
    reason: 'core must not read platform auth cookies directly.',
  },
  {
    pattern: /\bwindow\.location\.(?:assign|replace|href|pathname|search|hash)\b/,
    category: 'route/navigation global',
    reason: 'core must not assume dashboard routes; navigation belongs in app adapters/wrappers.',
  },
  {
    pattern: /(['"`])\/(?:dashboard|portal)(?:\/|\?|#|\1)/,
    category: 'dashboard route literal',
    reason: 'dashboard/portal routes belong in app wrappers, not reusable analyzer core.',
  },
  {
    pattern: /\bimport\.meta\.env\.VITE_(?:DASHBOARD|PORTAL|AUTH|API)_/,
    category: 'platform environment global',
    reason: 'core must not read platform shell/auth environment directly; inject configuration through adapters.',
  },
];

const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s*)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const failures = [];

for (const filePath of listSourceFiles(coreSrc)) {
  const contents = readFileSync(filePath, 'utf8');

  for (const match of contents.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    checkImport(filePath, contents, match.index ?? 0, specifier);
  }

  for (const rule of forbiddenCodePatterns) {
    for (const match of contents.matchAll(new RegExp(rule.pattern, `${rule.pattern.flags}g`))) {
      addFailure(filePath, contents, match.index ?? 0, rule.category, rule.reason);
    }
  }
}

checkLegacySrcChanges();

if (failures.length > 0) {
  console.error('Property Analyzer guardrails failed:');
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.line}:${failure.column} [${failure.category}] ${failure.reason}`);
  }
  process.exit(1);
}

console.log('Property Analyzer guardrails passed.');

function checkImport(filePath, contents, index, specifier) {
  for (const rule of forbiddenPackages) {
    if (rule.pattern.test(specifier)) {
      addFailure(filePath, contents, index, rule.category, rule.reason);
    }
  }

  if (specifier.startsWith('.')) {
    const resolvedPath = path.resolve(path.dirname(filePath), specifier);
    if (!isWithin(resolvedPath, corePackage)) {
      addFailure(
        filePath,
        contents,
        index,
        'relative import leaves core package',
        'relative imports from property-analyzer-core must stay inside the core package; use explicit adapters or shared package imports.',
      );
      return;
    }

    for (const rule of forbiddenResolvedPaths) {
      if (rule.test(resolvedPath)) {
        addFailure(filePath, contents, index, rule.category, rule.reason);
      }
    }
  }
}

function checkLegacySrcChanges() {
  const changedFiles = new Set();

  for (const filePath of git(['diff', '--name-only', '--', 'src'])) {
    changedFiles.add(filePath);
  }

  for (const filePath of git(['diff', '--name-only', '--cached', '--', 'src'])) {
    changedFiles.add(filePath);
  }

  const baseRef = explicitBase ?? process.env.GUARDRAILS_BASE_REF ?? process.env.GITHUB_BASE_REF;
  if (baseRef) {
    const diffBase = resolveDiffBase(baseRef);
    for (const filePath of git(['diff', '--name-only', `${diffBase}...HEAD`, '--', 'src'])) {
      changedFiles.add(filePath);
    }
  }

  for (const filePath of changedFiles) {
    failures.push({
      file: filePath,
      line: 1,
      column: 1,
      category: 'legacy src modification',
      reason: 'top-level src is a deprecated game copy and must not be modified for Property Analyzer extraction guardrails.',
    });
  }
}

function resolveDiffBase(baseRef) {
  if (refExists(baseRef)) {
    return baseRef;
  }

  const originRef = `origin/${baseRef}`;
  if (refExists(originRef)) {
    return originRef;
  }

  return baseRef;
}

function refExists(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  try {
    const output = execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function listSourceFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }
    if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      return [entryPath];
    }
    return [];
  });
}

function addFailure(filePath, contents, index, category, reason) {
  const { line, column } = lineAndColumn(contents, index);
  failures.push({
    file: path.relative(repoRoot, filePath),
    line,
    column,
    category,
    reason,
  });
}

function lineAndColumn(contents, index) {
  const before = contents.slice(0, index);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: lines.at(-1).length + 1,
  };
}

function isWithin(candidatePath, parentPath) {
  if (!existsSync(parentPath)) {
    return false;
  }
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}
