import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import path from 'node:path';

export interface CleanOptions {
  all?: boolean;
  cacheOnly?: boolean;
  keepLatest?: boolean;
}

export interface CleanResult {
  projectDir: string;
  cleanedItems: string[];
  freedBytes: number;
}

export async function runClean(projectDir: string, options: CleanOptions = {}): Promise<CleanResult> {
  const runsDir = path.join(projectDir, 'runs');
  const storyboardDir = path.join(projectDir, 'storyboard');
  const cleanedItems: string[] = [];
  let freedBytes = 0;

  function getDirSize(dirPath: string): number {
    let size = 0;
    if (!nodeFs.existsSync(dirPath)) return 0;
    const entries = nodeFs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(full);
      } else {
        size += nodeFs.statSync(full).size;
      }
    }
    return size;
  }

  // 1. Clean runs cache
  const cacheDir = path.join(runsDir, 'cache');
  if (nodeFs.existsSync(cacheDir)) {
    freedBytes += getDirSize(cacheDir);
    await fs.rm(cacheDir, { recursive: true, force: true });
    cleanedItems.push('runs/cache');
  }

  if (options.cacheOnly) {
    return { projectDir, cleanedItems, freedBytes };
  }

  // 2. Clean temporary storyboard frames
  if (nodeFs.existsSync(storyboardDir) && options.all) {
    freedBytes += getDirSize(storyboardDir);
    await fs.rm(storyboardDir, { recursive: true, force: true });
    cleanedItems.push('storyboard');
  }

  // 3. Clean runs
  if (nodeFs.existsSync(runsDir)) {
    const runEntries = (await fs.readdir(runsDir, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && entry.name.startsWith('run-'))
      .map(entry => {
        const full = path.join(runsDir, entry.name);
        const stat = nodeFs.statSync(full);
        return {
          name: entry.name,
          time: stat.mtimeMs || stat.birthtimeMs || 0
        };
      })
      .sort((a, b) => a.time - b.time);

    const runs = runEntries.map(e => e.name);

    if (options.all) {
      for (const r of runs) {
        const target = path.join(runsDir, r);
        freedBytes += getDirSize(target);
        await fs.rm(target, { recursive: true, force: true });
        cleanedItems.push(`runs/${r}`);
      }
    } else if (options.keepLatest && runs.length > 1) {
      const olderRuns = runs.slice(0, runs.length - 1);
      for (const r of olderRuns) {
        const target = path.join(runsDir, r);
        freedBytes += getDirSize(target);
        await fs.rm(target, { recursive: true, force: true });
        cleanedItems.push(`runs/${r}`);
      }
    }
  }

  return {
    projectDir,
    cleanedItems,
    freedBytes
  };
}
