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
}

export function classifyFileChange(filePath: string, changeType: 'added' | 'modified' | 'deleted' | 'renamed'): ClassifiedFileChange {
  const lower = filePath.toLowerCase();

  if (changeType === 'deleted' || changeType === 'renamed') {
    return {
      path: filePath,
      category: 'Removed or renamed path',
      required_evidence: 'All local mappings that reference it',
      default_disposition: 'Fail the import plan until references are repaired'
    };
  }

  if (lower.includes('license') || lower.includes('notice') || lower.includes('copying')) {
    return {
      path: filePath,
      category: 'License or notice',
      required_evidence: 'Complete changed terms and affected files',
      default_disposition: 'Block promotion until classified'
    };
  }

  if (lower.endsWith('package.json') || lower.endsWith('pnpm-lock.yaml') || lower.endsWith('package-lock.json') || lower.endsWith('requirements.txt')) {
    return {
      path: filePath,
      category: 'Dependency or runtime',
      required_evidence: 'Manifest and lockfile diff',
      default_disposition: 'Rebuild and render in the affected profile'
    };
  }

  if (lower.endsWith('skill.md') || lower.includes('prompt') || lower.includes('rules')) {
    return {
      path: filePath,
      category: 'Entry point or trigger',
      required_evidence: 'Old and new activation rules',
      default_disposition: 'Check routing and duplicate activation'
    };
  }

  if (lower.match(/\.(png|jpe?g|svg|webp|mp4|mov|mp3|wav|ogg)$/)) {
    return {
      path: filePath,
      category: 'Media addition',
      required_evidence: 'Source, rights, hash, intended use',
      default_disposition: 'Keep outside cleared assets until accepted'
    };
  }

  if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.includes('/docs/')) {
    return {
      path: filePath,
      category: 'Documentation only',
      required_evidence: 'Changed paths and semantic summary',
      default_disposition: 'Review without rendering unrelated workflows'
    };
  }

  if (lower.includes('api') || lower.includes('provider') || lower.includes('client') || lower.includes('service')) {
    return {
      path: filePath,
      category: 'External service',
      required_evidence: 'Domain, payload, cost behavior, auth path',
      default_disposition: 'Require an explicit provider policy'
    };
  }

  return {
    path: filePath,
    category: 'Script or template',
    required_evidence: 'File diff and affected capability list',
    default_disposition: 'Run the corresponding fixtures'
  };
}

