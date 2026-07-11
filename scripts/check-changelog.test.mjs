import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractUnreleasedBlock, checkChangelogEntry } from './check-changelog.mjs';

// Mirrors the actual current CHANGELOG.md stub in the repo root.
const STUB =
  '# Changelog\n\nAll notable changes to this project are documented in this file, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).\n\n## [Unreleased]\n';

test('extractUnreleasedBlock: current repo stub has an empty Unreleased section', () => {
  assert.equal(extractUnreleasedBlock(STUB), '');
});

test('checkChangelogEntry: ok when a real bullet is added under an empty Unreleased stub', () => {
  const current = STUB + '\n### Added\n- Strengthened the changelog placement check.\n';
  assert.equal(extractUnreleasedBlock(current), '### Added\n- Strengthened the changelog placement check.');

  const result = checkChangelogEntry(STUB, current);
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
});

test('checkChangelogEntry: fails when Unreleased content is unchanged from base (file touched elsewhere)', () => {
  const base =
    '# Changelog\n\n## [Unreleased]\n\n### Added\n- Existing entry not touched by this PR.\n\n## [1.0.0] - 2026-01-01\n- old entry\n';
  const current =
    '# Changelog\n\n## [Unreleased]\n\n### Added\n- Existing entry not touched by this PR.\n\n## [1.0.0] - 2026-01-01\n- old entry\n- unrelated retroactive note added to old release\n';
  assert.equal(extractUnreleasedBlock(base), extractUnreleasedBlock(current));

  const result = checkChangelogEntry(base, current);
  assert.equal(result.ok, false);
  assert.match(result.reason, /unchanged/i);
});

test('checkChangelogEntry: fails when current has no "## [Unreleased]" heading at all', () => {
  const current = '# Changelog\n\n## [Released]\n- typo in the heading\n';
  assert.equal(extractUnreleasedBlock(current), null);

  const result = checkChangelogEntry(STUB, current);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no.*section/i);
});

test('checkChangelogEntry: fails when Unreleased is immediately followed by another heading with only whitespace between', () => {
  const current = '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n- old entry\n';
  assert.equal(extractUnreleasedBlock(current), '');

  const result = checkChangelogEntry(STUB, current);
  assert.equal(result.ok, false);
  assert.match(result.reason, /empty/i);
});

test('checkChangelogEntry: fails when a new bullet lands after a version heading instead of under Unreleased (wrong location)', () => {
  const base = '## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n- old entry';
  const current = base + '\n- WRONGLY PLACED new entry';

  // Both sides extract to the SAME empty Unreleased block — the appended
  // line landed after the [1.0.0] heading, outside the Unreleased boundary.
  assert.equal(extractUnreleasedBlock(base), '');
  assert.equal(extractUnreleasedBlock(current), '');

  const result = checkChangelogEntry(base, current);
  assert.equal(result.ok, false);
});

test('checkChangelogEntry: ok when base CHANGELOG.md did not exist yet (first-time creation)', () => {
  const current = '# Changelog\n\n## [Unreleased]\n\n- Initial public release changelog seed.\n';
  assert.equal(extractUnreleasedBlock(current), '- Initial public release changelog seed.');

  const result = checkChangelogEntry(null, current);
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
});
