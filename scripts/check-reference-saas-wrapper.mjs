#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harnessRoot = path.join(repoRoot, 'apps/reference-saas-wrapper');
const srcRoot = path.join(harnessRoot, 'src');
const packageJsonPath = path.join(harnessRoot, 'package.json');
const viteConfigPath = path.join(harnessRoot, 'vite.config.ts');
const mainPath = path.join(srcRoot, 'main.tsx');
const forbiddenPatterns = [
  {
    pattern: /@deal-platform\/shared-auth/,
    reason: 'reference SaaS wrapper must not depend on shared-auth.',
  },
  {
    pattern: /@deal-platform\/shared-ui/,
    reason: 'reference SaaS wrapper must not depend on the dashboard/shared shell package.',
  },
  {
    pattern: /AssetDashboard|apps\/dashboard|AppShell/,
    reason: 'reference SaaS wrapper must not import or name dashboard shell surfaces.',
  },
  {
    pattern: /\blocalStorage\b|\bsessionStorage\b/,
    reason: 'reference SaaS wrapper smoke auth/storage must be injected, not browser auth globals.',
  },
];

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const dependencyNames = [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
];

for (const dependencyName of dependencyNames) {
  if (dependencyName === '@deal-platform/shared-auth' || dependencyName === '@deal-platform/shared-ui') {
    fail(`${packageJson.name} declares forbidden dependency ${dependencyName}.`);
  }
}

for (const filePath of listFiles(srcRoot).concat([viteConfigPath, packageJsonPath])) {
  const contents = readFileSync(filePath, 'utf8');
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(contents)) {
      fail(`${path.relative(repoRoot, filePath)}: ${rule.reason}`);
    }
  }
}

const viteConfig = readFileSync(viteConfigPath, 'utf8');
assertIncludes(viteConfig, "base: '/investor-lab/'", 'Vite base must prove an alternate SaaS base path.');

const main = readFileSync(mainPath, 'utf8');
assertIncludes(main, "const BASE_PATH = '/investor-lab'", 'Harness must pass the alternate base path into core.');
assertIncludes(main, "productName: 'Investor Lab Analyzer'", 'Harness must pass alternate branding into core.');
assertIncludes(main, "platformName: 'Reference SaaS Platform'", 'Harness must pass alternate platform branding into core.');
assertIncludes(main, 'askWill: false', 'Harness must demonstrate disabled AskWill feature flag.');
assertIncludes(main, 'comparisons: false', 'Harness must demonstrate disabled comparison feature flag.');
assertIncludes(main, 'publicSharing: false', 'Harness must demonstrate disabled public-sharing feature flag.');
assertIncludes(main, 'pdfExport: false', 'Harness must demonstrate disabled export feature flag.');
assertIncludes(main, 'streetView: false', 'Harness must demonstrate disabled Street View feature flag.');
assertIncludes(main, 'aiComparisonSummary: false', 'Harness must demonstrate disabled AI comparison feature flag.');
assertIncludes(main, 'aiPropertyNarratives: false', 'Harness must demonstrate disabled AI narrative feature flag.');

execFileSync('npm', ['run', 'build', '-w', '@deal-platform/shared-types'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

execFileSync('npm', ['run', 'build', '-w', '@deal-platform/property-analyzer-core'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

execFileSync('npm', ['run', 'build:reference-saas-wrapper'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

const distRoot = path.join(harnessRoot, 'dist');
if (!existsSync(path.join(distRoot, 'index.html'))) {
  fail('Reference SaaS wrapper build did not produce dist/index.html.');
}

const distBundle = listFiles(distRoot)
  .filter(filePath => /\.(?:js|html|css)$/.test(filePath))
  .map(filePath => readFileSync(filePath, 'utf8'))
  .join('\n');

assertIncludes(distBundle, '/investor-lab/', 'Built harness output must retain the alternate base path.');
assertIncludes(distBundle, 'Investor Lab Analyzer', 'Built harness output must retain alternate branding.');

console.log('Reference SaaS wrapper smoke check passed.');

function listFiles(directory) {
  return readdirSync(directory).flatMap(entry => {
    const entryPath = path.join(directory, entry);
    const stats = statSync(entryPath);
    return stats.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function assertIncludes(contents, expected, reason) {
  if (!contents.includes(expected)) {
    fail(reason);
  }
}

function fail(message) {
  console.error(`Reference SaaS wrapper smoke check failed: ${message}`);
  process.exit(1);
}
