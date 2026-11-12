/**
 * Skill lint, run by the packager over SKILL.md and every reference file:
 * - frontmatter `name` equals the folder, uses [a-z0-9-] and is at most 64 characters;
 *   `description` is present and at most 1024 characters;
 * - `metadata.tested-against` names the toolkit version (package.json) the skill was checked with;
 * - every `mgvideo <command> [<subcommand>]` a skill names exists in the CLI help snapshot;
 * - opinion guard (warnings): hard-coded hex colours and "always use" / "the best" read as taste
 *   presented as a rule. A line with `opinion-ok: <reason>` is exempt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { snapshotCommands } from './cli_snapshot.js';

export interface LintResult { errors: string[]; warnings: string[] }

/** Minimal frontmatter reader: top-level `key: value` lines and one level of `metadata:` keys. */
export function frontmatter(text: string): Record<string, string> | null {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const out: Record<string, string> = {};
  let parent = '';
  for (const line of m[1].split('\n')) {
    const nested = /^\s{2,}([\w-]+):\s*(.*)$/.exec(line);
    const top = /^([\w-]+):\s*(.*)$/.exec(line);
    if (top) {
      parent = top[1];
      out[top[1]] = unquote(top[2]);
    } else if (nested && parent) {
      out[`${parent}.${nested[1]}`] = unquote(nested[2]);
    }
  }
  return out;
}

const unquote = (v: string) => v.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

function markdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? markdownFiles(p) : e.name.endsWith('.md') ? [p] : [];
  });
}

const HEX = /(?<![\w&#])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;
const ABSOLUTE = /\b(always use|the best)\b/i;

export function lintSkills(skillsDir: string, snapshot: string, version: string): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const commands = snapshotCommands(snapshot).map(c => c.slice(1));
  const top = new Set(commands.filter(c => c.length === 1).map(c => c[0]));
  const groups = new Map<string, Set<string>>();
  for (const c of commands.filter(c => c.length === 2)) {
    if (!groups.has(c[0])) groups.set(c[0], new Set());
    groups.get(c[0])!.add(c[1]);
  }
  // A group whose own usage takes no argument must be followed by one of its subcommands.
  const usage = (name: string) => new RegExp(`^Usage: mgvideo ${name} (.*)$`, 'm').exec(snapshot)?.[1] ?? '';
  const pureGroup = (name: string) => groups.has(name) && !/[<[]/.test(usage(name).replace('[options]', '').replace('[command]', ''));

  for (const skill of fs.readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)) {
    const dir = path.join(skillsDir, skill);
    const main = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(main)) continue; // reported by the packager
    const fm = frontmatter(fs.readFileSync(main, 'utf8'));
    if (!fm) {
      errors.push(`${skill}/SKILL.md: no frontmatter`);
    } else {
      if (fm.name !== skill) errors.push(`${skill}/SKILL.md: name "${fm.name ?? ''}" does not match the folder`);
      if (fm.name && (!/^[a-z0-9-]+$/.test(fm.name) || fm.name.length > 64)) errors.push(`${skill}/SKILL.md: name must be [a-z0-9-], at most 64 characters`);
      if (!fm.description) errors.push(`${skill}/SKILL.md: description is missing`);
      else if (fm.description.length > 1024) errors.push(`${skill}/SKILL.md: description is ${fm.description.length} characters (max 1024)`);
      const tested = fm['metadata.tested-against'];
      if (!tested) errors.push(`${skill}/SKILL.md: metadata.tested-against is missing (the mgvideo version the skill was checked with)`);
      else if (tested !== version) errors.push(`${skill}/SKILL.md: tested against mgvideo ${tested}, the toolkit is ${version}; re-check the skill and update it`);
    }

    for (const file of markdownFiles(dir)) {
      const rel = path.relative(skillsDir, file);
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      let fence = false;
      lines.forEach((line, i) => {
        if (/^\s*```/.test(line)) fence = !fence;
        const where = `${rel}:${i + 1}`;
        for (const m of line.matchAll(/\bmgvideo ([a-z][a-z0-9-]*)(?: ([a-z][a-z0-9-]*))?/g)) {
          const [, cmd, sub] = m;
          if (!top.has(cmd)) {
            errors.push(`${where}: \`mgvideo ${cmd}\` is not a mgvideo command`);
          } else if (sub && pureGroup(cmd) && !groups.get(cmd)!.has(sub)) {
            errors.push(`${where}: \`mgvideo ${cmd} ${sub}\` is not a subcommand (has: ${[...groups.get(cmd)!].join(', ')})`);
          }
        }
        if (line.includes('opinion-ok:')) return;
        if (!fence && HEX.test(line.replace(/`[^`]*`/g, ''))) warnings.push(`${where}: hard-coded hex colour outside code (take colours from brand.json, or mark opinion-ok: <reason>)`);
        const abs = ABSOLUTE.exec(line);
        if (abs) warnings.push(`${where}: "${abs[1]}" states taste as a rule (say when and why, or mark opinion-ok: <reason>)`);
      });
    }
  }
  return { errors, warnings };
}
