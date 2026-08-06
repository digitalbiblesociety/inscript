/**
 * Playwright test fixtures.
 *
 * Provides `appPath` keyed off the project's `metadata.profile`:
 *   - 'remote' (default) → '/'           hits inscript.bible.cloud
 *   - 'local'            → '/?custom=local' serves content from public/
 *
 * Specs use `await page.goto(appPath)` instead of hardcoding '/' so the same
 * suite runs in both modes without forking.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test as base, expect } from '@playwright/test';
import libCoverage from 'istanbul-lib-coverage';
import libSourceMaps from 'istanbul-lib-source-maps';

const coverageEnabled = process.env.VITE_COVERAGE === 'true';
const coverageDirectory = resolve('.nyc_output');

async function saveBrowserCoverage(page, testInfo) {
  if (!coverageEnabled || page.isClosed()) return;

  let coverage;
  try {
    coverage = await page.evaluate(() => globalThis.__coverage__);
  } catch {
    // The page can disappear during a failed navigation or test teardown.
    return;
  }

  if (!coverage) return;

  // Vite instruments transformed modules. Remap their counters to the original
  // source locations before NYC merges them with Vitest's native source maps;
  // otherwise equivalent statements have different columns and are counted twice.
  const coverageMap = libCoverage.createCoverageMap(coverage);
  const remappedCoverage = await libSourceMaps.createSourceMapStore().transformCoverage(coverageMap);

  await mkdir(coverageDirectory, { recursive: true });
  const project = testInfo.project.name.replaceAll(/[^a-z0-9_-]/gi, '-');
  const filename = `playwright-${project}-${testInfo.workerIndex}-${randomUUID()}.json`;
  await writeFile(resolve(coverageDirectory, filename), JSON.stringify(remappedCoverage.toJSON()));
}

export const test = base.extend({
  browserCoverage: [async ({ page }, use, testInfo) => {
    if (!coverageEnabled) {
      await use();
      return;
    }

    // Capture before a full navigation discards the current window's counters.
    const originalGoto = page.goto.bind(page);
    page.goto = async (...args) => {
      await saveBrowserCoverage(page, testInfo);
      return originalGoto(...args);
    };

    const originalReload = page.reload.bind(page);
    page.reload = async (...args) => {
      await saveBrowserCoverage(page, testInfo);
      return originalReload(...args);
    };

    try {
      await use();
    } finally {
      await saveBrowserCoverage(page, testInfo);
    }
  }, { auto: true }],
  appPath: async ({}, use, testInfo) => {
    const profile = testInfo.project.metadata?.profile ?? 'remote';
    const path = profile === 'local' ? '/?custom=local' : '/';
    await use(path);
  },
  profile: async ({}, use, testInfo) => {
    await use(testInfo.project.metadata?.profile ?? 'remote');
  },
  // Build a URL combining the profile's base query with extra params.
  // makeUrl({ dev: 'true' }) → '/?custom=local&dev=true' (local) or '/?dev=true' (remote)
  makeUrl: async ({}, use, testInfo) => {
    const profile = testInfo.project.metadata?.profile ?? 'remote';
    await use((extra = {}) => {
      const params = new URLSearchParams();
      if (profile === 'local') params.set('custom', 'local');
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
      const qs = params.toString();
      return qs ? `/?${qs}` : '/';
    });
  }
});

export { expect };
