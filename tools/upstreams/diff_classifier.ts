export type ChangeCategory =
  | 'Documentation only'
  | 'Entry point or trigger'
  | 'Script or template'
  | 'Dependency or runtime'
  | 'License or notice'
  | 'Media addition'
  | 'External service'
  | 'Removed or renamed path';

export interface ClassifiedFileChange {
  path: string;
  category: ChangeCategory;
  required_evidence: string;
  default_disposition: string;
  /** Additional categories that also apply (e.g. a renamed agent instruction file). */
  also?: ChangeCategory[];
}

/** File names that agents load as instructions. A change here can redirect agent behavior. */
const AGENT_INSTRUCTION_FILES = new Set([
  'skill.md',
  'claude.md',
  'agents.md',
  'agent.md',
  'gemini.md',
  'copilot-instructions.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  'system_prompt.md',
]);

const AGENT_INSTRUCTION_DIRS = ['.claude/', '.cursor/', '.github/copilot', '.codex/', '.agents/', 'prompts/'];

/** Manifests, lockfiles and build/runtime definitions that change what code runs. */
const DEPENDENCY_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'npm-shrinkwrap.json',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  'requirements.txt',
  'pyproject.toml',
  'poetry.lock',
  'pipfile',
  'pipfile.lock',
  'setup.py',
  'setup.cfg',
  'go.mod',
  'go.sum',
  'cargo.toml',
  'cargo.lock',
  'gemfile',
  'gemfile.lock',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'makefile',
  '.nvmrc',
  '.node-version',
  '.tool-versions',
]);

const EXECUTABLE_EXT = /\.(sh|bash|zsh|ps1|bat|cmd|py|rb|pl|mjs|cjs|js|ts|tsx|jsx)$/;

function classifyPath(filePath: string): ClassifiedFileChange {
  const lower = filePath.toLowerCase().replace(/\\/g, '/');
  const base = lower.split('/').pop() ?? lower;

  // 1. Agent instruction entry points are checked before any documentation rule.
  if (
    AGENT_INSTRUCTION_FILES.has(base) ||
    AGENT_INSTRUCTION_DIRS.some(d => lower.startsWith(d) || lower.includes(`/${d}`)) ||
    /(^|[/_.-])(prompt|prompts|rules)([/_.-]|$)/.test(lower)
  ) {
    return {
      path: filePath,
      category: 'Entry point or trigger',
      required_evidence: 'Old and new activation rules and full instruction diff',
      default_disposition: 'Static review of instructions; check routing and duplicate activation'
    };
  }

  // 2. License and notice files.
  if (/(^|\/)(license|licence|notice|copying|patents)([._-][^/]*)?$/.test(lower) || base.startsWith('license') || base.startsWith('notice') || base.startsWith('copying')) {
    return {
      path: filePath,
      category: 'License or notice',
      required_evidence: 'Complete changed terms and affected files',
      default_disposition: 'Block promotion until classified'
    };
  }

  // 3. Dependencies, CI and runtime definitions.
  if (
    DEPENDENCY_FILES.has(base) ||
    base.startsWith('dockerfile') ||
    lower.startsWith('.github/workflows/') ||
    lower.includes('/.github/workflows/') ||
    lower.startsWith('.github/actions/') ||
    base === '.gitlab-ci.yml' ||
    lower.startsWith('.circleci/') ||
    lower.endsWith('.sh') ||
    base === 'postinstall' ||
    lower.startsWith('patches/')
  ) {
    return {
      path: filePath,
      category: 'Dependency or runtime',
      required_evidence: 'Manifest, lockfile, CI or script diff',
      default_disposition: 'Rebuild and render in affected profile inside a disposable sandbox'
    };
  }

  // 4. Media.
  if (/\.(png|jpe?g|gif|svg|webp|avif|mp4|mov|webm|mkv|mp3|wav|ogg|flac|aac|m4a|ttf|otf|woff2?)$/.test(lower)) {
    return {
      path: filePath,
      category: 'Media addition',
      required_evidence: 'Source, rights, hash, intended use',
      default_disposition: 'Keep outside cleared assets until accepted'
    };
  }

  // 5. External services (code that talks to the network).
  if (EXECUTABLE_EXT.test(lower) && /(api|provider|client|service|webhook|http)/.test(base)) {
    return {
      path: filePath,
      category: 'External service',
      required_evidence: 'Domain, payload, cost behavior, auth path',
      default_disposition: 'Require an explicit provider policy'
    };
  }

  // 6. Plain documentation (only non-executable text files).
  if (!EXECUTABLE_EXT.test(lower) && (lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.txt') || lower.endsWith('.rst') || lower.startsWith('docs/') || lower.includes('/docs/'))) {
    return {
      path: filePath,
      category: 'Documentation only',
      required_evidence: 'Changed paths and semantic summary',
      default_disposition: 'Review without rendering unrelated workflows'
    };
  }

  return {
    path: filePath,
    category: 'Script or template',
    required_evidence: 'File diff and affected capability list',
    default_disposition: 'Run corresponding fixtures'
  };
}

export function classifyFileChange(filePath: string, changeType: 'added' | 'modified' | 'deleted' | 'renamed'): ClassifiedFileChange {
  if (changeType === 'deleted' || changeType === 'renamed') {
    // Removal or rename is primary, but the content-based class still applies
    // (e.g. a renamed CLAUDE.md is still an instruction change).
    const content = classifyPath(filePath);
    return {
      path: filePath,
      category: 'Removed or renamed path',
      required_evidence: `All local mappings that reference it; plus: ${content.required_evidence}`,
      default_disposition: 'Fail the import plan until references are repaired',
      also: content.category === 'Script or template' ? [] : [content.category]
    };
  }
  return classifyPath(filePath);
}
