import fs from 'node:fs/promises';
import path from 'node:path';
import { lintSkills } from './skill_lint.js';

export const CANONICAL_SKILL_ALLOWLIST = [
  'magnifito-video',
  'magnifito-brand',
  'magnifito-storyboard',
  'magnifito-promo',
  'magnifito-product-demo',
  'magnifito-edit',
  'magnifito-broll',
  'magnifito-audio',
  'magnifito-variants',
  'magnifito-deliver'
] as const;

export interface PackageResult {
  packagedSkills: string[];
  verifiedAllowlist: boolean;
  errors: string[];
  /** Skill lint warnings (opinion guard); they do not fail packaging. */
  warnings: string[];
}

/** Recursively copies a skill directory, refusing symlinks so nothing outside the skill is pulled in. */
async function copySkillDir(src: string, dest: string): Promise<number> {
  await fs.mkdir(dest, { recursive: true });
  let count = 0;
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isSymbolicLink()) {
      throw new Error(`Refusing to package symlink: ${from}`);
    }
    if (ent.isDirectory()) {
      count += await copySkillDir(from, to);
    } else if (ent.isFile()) {
      await fs.copyFile(from, to);
      count++;
    }
  }
  return count;
}

export async function packageSkills(
  targetPlatform: 'claude' | 'antigravity' | 'codex',
  outputDir: string,
  workspaceRoot = process.cwd()
): Promise<PackageResult> {
  const sourceSkillsDir = path.join(workspaceRoot, 'skills');
  const targetDir = path.resolve(outputDir, targetPlatform);
  // Start from a clean target so stale skills from earlier runs cannot leak into the package.
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  const entries = await fs.readdir(sourceSkillsDir, { withFileTypes: true });
  const discoveredSkills: string[] = [];
  const errors: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // Strict allowlist enforcement
    if (!CANONICAL_SKILL_ALLOWLIST.includes(entry.name as typeof CANONICAL_SKILL_ALLOWLIST[number])) {
      errors.push(`Unapproved non-canonical skill directory: ${entry.name}`);
      continue;
    }

    const entryPath = path.join(sourceSkillsDir, entry.name);
    try {
      await fs.access(path.join(entryPath, 'SKILL.md'));
    } catch {
      errors.push(`${entry.name} lacks SKILL.md`);
      continue;
    }

    await copySkillDir(entryPath, path.join(targetDir, entry.name));
    discoveredSkills.push(entry.name);
  }

  for (const required of CANONICAL_SKILL_ALLOWLIST) {
    if (!discoveredSkills.includes(required)) errors.push(`Missing canonical skill: ${required}`);
  }

  // Skill lint: frontmatter, tested-against version, mgvideo verbs, opinion guard.
  const warnings: string[] = [];
  try {
    const snapshot = await fs.readFile(path.join(workspaceRoot, 'tools', 'packaging', 'cli-help.snapshot.txt'), 'utf-8');
    const version = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'package.json'), 'utf-8')).version as string;
    const lint = lintSkills(sourceSkillsDir, snapshot, version);
    errors.push(...lint.errors);
    warnings.push(...lint.warnings);
  } catch (err) {
    errors.push(`Skill lint could not run: ${(err as Error).message}`);
  }

  // Coverage ladder (registry/capabilities.json): every canonical skill rates itself D0-D4 with evidence.
  try {
    const caps = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'registry', 'capabilities.json'), 'utf-8'));
    for (const id of CANONICAL_SKILL_ALLOWLIST) {
      const c = caps.canonical_skills?.find((s: { id: string }) => s.id === id)?.coverage;
      if (!c || !/^D[0-4]$/.test(c.level ?? '') || !c.evidence) errors.push(`${id}: registry/capabilities.json needs coverage { level: D0-D4, evidence }`);
    }
  } catch (err) {
    errors.push(`Coverage ladder could not be read: ${(err as Error).message}`);
  }

  const verified = errors.length === 0 &&
    discoveredSkills.length === CANONICAL_SKILL_ALLOWLIST.length;

  const manifest = {
    platform: targetPlatform,
    generated_at: new Date().toISOString(),
    skills_count: discoveredSkills.length,
    skills: discoveredSkills.sort(),
    verified_allowlist: verified,
    errors
  };

  await fs.writeFile(
    path.join(targetDir, 'skills-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  return {
    packagedSkills: discoveredSkills,
    verifiedAllowlist: verified,
    errors,
    warnings
  };
}

// When executed directly
if (process.argv[1]?.endsWith('packager.ts') || process.argv[1]?.endsWith('packager.js')) {
  (async () => {
    console.log('📦 Running Magnifito Skill Packager...');
    let failed = false;
    for (const p of ['antigravity', 'claude', 'codex'] as const) {
      const res = await packageSkills(p, './dist/packaged-skills');
      console.log(`  • Platform [${p}]: Packaged ${res.packagedSkills.length} skills (Allowlist verified: ${res.verifiedAllowlist})`);
      for (const e of res.errors) console.error(`    ✗ ${e}`);
      if (p === 'claude') for (const w of res.warnings) console.warn(`    ! ${w}`);
      if (!res.verifiedAllowlist) failed = true;
    }
    if (failed) {
      console.error('❌ Packaging failed allowlist verification.');
      process.exit(1);
    }
  })().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
