import fs from 'node:fs/promises';
import path from 'node:path';

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

export async function packageSkills(
  targetPlatform: 'claude' | 'antigravity' | 'codex',
  outputDir: string
): Promise<{ packagedSkills: string[]; verifiedAllowlist: boolean }> {
  const workspaceRoot = process.cwd();
  const sourceSkillsDir = path.join(workspaceRoot, 'skills');
  const targetDir = path.resolve(outputDir, targetPlatform);

  await fs.mkdir(targetDir, { recursive: true });

  const entries = await fs.readdir(sourceSkillsDir);
  const discoveredSkills: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(sourceSkillsDir, entry);
    const stat = await fs.stat(entryPath);
    if (!stat.isDirectory()) continue;

    // Strict allowlist enforcement
    if (!CANONICAL_SKILL_ALLOWLIST.includes(entry as typeof CANONICAL_SKILL_ALLOWLIST[number])) {
      console.warn(`[Packager] Skipping unapproved non-canonical directory: ${entry}`);
      continue;
    }

    discoveredSkills.push(entry);

    const skillDest = path.join(targetDir, entry);
    await fs.mkdir(skillDest, { recursive: true });

    // Copy SKILL.md
    const skillMdSource = path.join(entryPath, 'SKILL.md');
    try {
      await fs.copyFile(skillMdSource, path.join(skillDest, 'SKILL.md'));
    } catch {
      console.warn(`[Packager] Warning: ${entry} lacks SKILL.md`);
    }
  }

  // Generate platform-specific manifest
  const manifest = {
    platform: targetPlatform,
    generated_at: new Date().toISOString(),
    skills_count: discoveredSkills.length,
    skills: discoveredSkills.sort()
  };

  await fs.writeFile(
    path.join(targetDir, 'skills-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  const verified = discoveredSkills.length === CANONICAL_SKILL_ALLOWLIST.length &&
    CANONICAL_SKILL_ALLOWLIST.every(s => discoveredSkills.includes(s));

  return {
    packagedSkills: discoveredSkills,
    verifiedAllowlist: verified
  };
}

// When executed directly
if (process.argv[1]?.endsWith('packager.ts') || process.argv[1]?.endsWith('packager.js')) {
  (async () => {
    console.log('📦 Running Magnifito Skill Packager...');
    for (const p of ['antigravity', 'claude', 'codex'] as const) {
      const res = await packageSkills(p, './dist/packaged-skills');
      console.log(` • Platform [${p}]: Packaged ${res.packagedSkills.length} skills (Allowlist verified: ${res.verifiedAllowlist})`);
    }
  })();
}
