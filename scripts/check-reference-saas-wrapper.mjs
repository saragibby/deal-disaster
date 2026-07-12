#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harnessRoot = path.join(repoRoot, 'apps/reference-saas-wrapper');
const srcRoot = path.join(harnessRoot, 'src');
const assetWrapperRoot = path.join(repoRoot, 'apps/property-analyzer/src');
const coreRoot = path.join(repoRoot, 'packages/property-analyzer-core/src');
const packageJsonPath = path.join(harnessRoot, 'package.json');
const viteConfigPath = path.join(harnessRoot, 'vite.config.ts');
const mainPath = path.join(srcRoot, 'main.tsx');
const assetMainPath = path.join(assetWrapperRoot, 'main.tsx');
const assetContextPath = path.join(assetWrapperRoot, 'wrapper/AssetDashboardAnalyzerContext.tsx');
const coreIndexPath = path.join(coreRoot, 'index.tsx');
const analysisResultsPath = path.join(coreRoot, 'components/AnalysisResults.tsx');
const comparisonDashboardPath = path.join(coreRoot, 'components/ComparisonDashboard.tsx');
const comparisonSelectorPath = path.join(coreRoot, 'components/ComparisonSelector.tsx');
const sharedAnalysisViewPath = path.join(coreRoot, 'components/SharedAnalysisView.tsx');
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
assertIncludes(main, "tenantId: 'reference-saas-tenant'", 'Harness auth must use a non-dashboard tenant session.');
assertIncludes(main, "roles: ['member']", 'Harness auth must use SaaS member roles instead of dashboard roles.');
assertIncludes(main, "'analysis:read'", 'Harness auth must grant analysis read permission through an injected session.');
assertIncludes(main, "'analysis:write'", 'Harness auth must grant analysis write permission through an injected session.');
assertIncludes(main, "'comparison:read'", 'Harness auth must grant comparison read permission through an injected session.');
assertIncludes(main, "return SAAS_SESSION;", 'Harness auth adapter must satisfy session requirements without shared-auth globals.');
assertIncludes(main, "const BASE_PATH = '/investor-lab'", 'Harness routing must be rooted at the alternate SaaS base path.');
assertIncludes(main, "pathname.startsWith(BASE_PATH)", 'Harness routing must parse routes relative to the SaaS base path.');
assertIncludes(main, "internalPath.startsWith('/analysis/')", 'Harness routing must support analysis deep links.');
assertIncludes(main, "internalPath === '/compare'", 'Harness routing must support comparison links.');
assertIncludes(main, "internalPath.startsWith('/shared/')", 'Harness routing must support shared analysis links.');
assertIncludes(main, "routeToPath({ kind: 'analyze', slug })", 'Harness share URLs must build private analysis links through the navigation adapter.');
assertIncludes(main, "routeToPath({ kind: 'shared', slug })", 'Harness share URLs must build public shared analysis links through the navigation adapter.');
assertIncludes(main, "routeToPath({ kind: 'compare', propertySlugs })", 'Harness share URLs must build private comparison links through the navigation adapter.');
assertIncludes(main, "throw new Error(`Public sharing is disabled", 'Harness must fail loudly if disabled public sharing is invoked.');
assertIncludes(main, "window.dispatchEvent(new CustomEvent('reference-saas:share-link-copied'", 'Harness must surface share-copy events.');
assertIncludes(main, "window.dispatchEvent(new CustomEvent('reference-saas:export-started'", 'Harness must surface export events.');
assertIncludes(main, "productName: 'Investor Lab Analyzer'", 'Harness must pass alternate branding into core.');
assertIncludes(main, "platformName: 'Reference SaaS Platform'", 'Harness must pass alternate platform branding into core.');
assertIncludes(main, 'askWill: false', 'Harness must demonstrate disabled AskWill feature flag.');
assertIncludes(main, 'comparisons: false', 'Harness must demonstrate disabled comparison feature flag.');
assertIncludes(main, 'publicSharing: false', 'Harness must demonstrate disabled public-sharing feature flag.');
assertIncludes(main, 'pdfExport: false', 'Harness must demonstrate disabled export feature flag.');
assertIncludes(main, 'streetView: false', 'Harness must demonstrate disabled Street View feature flag.');
assertIncludes(main, 'aiComparisonSummary: false', 'Harness must demonstrate disabled AI comparison feature flag.');
assertIncludes(main, 'aiPropertyNarratives: false', 'Harness must demonstrate disabled AI narrative feature flag.');
assertIncludes(main, "storeAnalysis(buildAnalysis(3, 'reference-saas-3'))", 'Harness must seed the reported reference-saas-3 deep link.');
assertIncludes(main, 'marketStatistics,', 'Harness analyses must include deterministic market statistics for rental tabs.');
assertIncludes(main, 'buildMarketTrendResponse(analysis.property_data, marketStatistics)', 'Harness market trend API must serve seeded market snapshot data.');

const assetMain = readFileSync(assetMainPath, 'utf8');
assertIncludes(assetMain, "basename: '/property-analyzer'", 'Asset Dashboard wrapper must keep the production /property-analyzer basename.');
assertIncludes(assetMain, "path: '/analysis/:id'", 'Asset Dashboard wrapper must keep analysis deep-link routing.');
assertIncludes(assetMain, "path: '/compare'", 'Asset Dashboard wrapper must keep comparison routing.');
assertIncludes(assetMain, "path: '/shared/:slug'", 'Asset Dashboard wrapper must keep shared analysis routing.');
assertIncludes(assetMain, '<AuthProvider>', 'Asset Dashboard wrapper must continue to use shared-auth.');
assertIncludes(assetMain, '<AssetDashboardAnalyzerProvider>', 'Asset Dashboard wrapper must continue to inject dashboard adapters.');

const assetContext = readFileSync(assetContextPath, 'utf8');
assertIncludes(assetContext, "const BASE_PATH = '/property-analyzer'", 'Asset Dashboard adapter must keep production analyzer base path.');
assertIncludes(assetContext, 'useAuth', 'Asset Dashboard adapter must continue to source dashboard auth.');
assertIncludes(assetContext, 'analyzerApi', 'Asset Dashboard adapter must continue to use the shared analyzer API client.');
assertIncludes(assetContext, "tenantId: 'asset-dashboard'", 'Asset Dashboard adapter must keep asset-dashboard tenant context.');
assertIncludes(assetContext, "redirectToLogin()", 'Asset Dashboard adapter must keep unauthenticated redirects.');
assertIncludes(assetContext, "case 'compare':", 'Asset Dashboard adapter must keep comparison route parsing.');
assertIncludes(assetContext, "case 'shared':", 'Asset Dashboard adapter must keep shared route URL generation.');
assertIncludes(assetContext, "buildAbsoluteAppUrl(`/analysis/${encodeURIComponent(slug)}`)", 'Asset Dashboard share builder must keep private analysis links.');
assertIncludes(assetContext, "buildAbsoluteAppUrl(`/shared/${encodeURIComponent(slug)}`)", 'Asset Dashboard share builder must keep public shared links.');
assertIncludes(assetContext, "buildAbsoluteAppUrl(`/compare?props=${props}`)", 'Asset Dashboard share builder must keep comparison links.');
assertIncludes(assetContext, "publicSharing: runtime.publicSharing !== false", 'Asset Dashboard feature flags must keep public sharing enabled by default.');
assertIncludes(assetContext, "pdfExport: runtime.pdfExport !== false", 'Asset Dashboard feature flags must keep export enabled by default.');
assertIncludes(assetContext, "comparisons: runtime.comparisons !== false", 'Asset Dashboard feature flags must keep comparisons enabled by default.');
assertIncludes(assetContext, "savedComparisons: runtime.savedComparisons !== false", 'Asset Dashboard feature flags must keep saved comparisons enabled by default.');
assertIncludes(assetContext, "dispatchAnalyzerEvent('property-analyzer:share-link-copied'", 'Asset Dashboard adapter must keep share-copy events.');
assertIncludes(assetContext, "dispatchAnalyzerEvent('property-analyzer:export-started'", 'Asset Dashboard adapter must keep export events.');

const coreIndex = readFileSync(coreIndexPath, 'utf8');
assertIncludes(coreIndex, "route.kind === 'compare' && comparisonsEnabled", 'Core must keep comparison routes gated by feature flags.');
assertIncludes(coreIndex, "if (tab === 'compare' && !features.comparisons) return;", 'Core must prevent comparison navigation when disabled.');
assertIncludes(coreIndex, '{features.comparisons && (', 'Core must hide comparison navigation when disabled.');

const analysisResults = readFileSync(analysisResultsPath, 'utf8');
assertIncludes(analysisResults, '{features.publicSharing && (', 'Core must gate public sharing controls.');
assertIncludes(analysisResults, '{features.publicSharing && isShared && (', 'Core must gate public link copying.');
assertIncludes(analysisResults, '{features.pdfExport && (', 'Core must gate analysis export controls.');

const comparisonDashboard = readFileSync(comparisonDashboardPath, 'utf8');
assertIncludes(comparisonDashboard, 'adapters.events?.shareLinkCopied?.(url);', 'Core comparison sharing must dispatch through injected events.');
assertIncludes(comparisonDashboard, 'onExportPdf={features.pdfExport ? exportToPdf : undefined}', 'Core must gate comparison PDF exports.');
assertIncludes(comparisonDashboard, 'onSave={features.savedComparisons ? handleSave : undefined}', 'Core must gate saved comparison writes.');

const comparisonSelector = readFileSync(comparisonSelectorPath, 'utf8');
assertIncludes(comparisonSelector, 'if (!features.savedComparisons)', 'Core must skip saved-comparison loading when disabled.');
assertIncludes(comparisonSelector, '{features.savedComparisons && (', 'Core must hide saved-comparison UI when disabled.');

const sharedAnalysisView = readFileSync(sharedAnalysisViewPath, 'utf8');
assertIncludes(sharedAnalysisView, '{features.pdfExport && (', 'Core must gate public shared-view export controls.');

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
