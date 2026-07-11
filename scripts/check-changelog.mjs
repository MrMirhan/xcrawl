import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export function extractUnreleasedBlock(content) {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === '## [Unreleased]');
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^## \[/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join('\n').trim();
}

export function checkChangelogEntry(baseContent, currentContent) {
  const currentBlock = extractUnreleasedBlock(currentContent);
  if (currentBlock === null) {
    return { ok: false, reason: 'CHANGELOG.md has no "## [Unreleased]" section.' };
  }
  if (currentBlock.length === 0) {
    return { ok: false, reason: 'The "## [Unreleased]" section is empty.' };
  }
  const baseBlock = baseContent === null ? '' : (extractUnreleasedBlock(baseContent) ?? '');
  if (currentBlock === baseBlock) {
    return { ok: false, reason: 'No new content was added under "## [Unreleased]" — the section is unchanged from the base branch.' };
  }
  return { ok: true, reason: null };
}

function main() {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error('Usage: node scripts/check-changelog.mjs <base-ref>');
    process.exit(2);
  }
  let baseContent = null;
  try {
    baseContent = execFileSync('git', ['show', `${baseRef}:CHANGELOG.md`], { encoding: 'utf8' });
  } catch {
    baseContent = null;
  }
  const currentContent = readFileSync('CHANGELOG.md', 'utf8');
  const result = checkChangelogEntry(baseContent, currentContent);
  if (!result.ok) {
    console.error(
      `::error::${result.reason} Add a line under "## [Unreleased]" describing the change, or add the "skip-changelog" label if this PR doesn't need one (docs/CI/chore).`,
    );
    process.exit(1);
  }
  console.log('CHANGELOG.md check passed — new content found under "## [Unreleased]".');
}

const isMainModule = process.argv[1] && process.argv[1].endsWith('check-changelog.mjs');
if (isMainModule) {
  main();
}
