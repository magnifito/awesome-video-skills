import type { AssetManifest, ClaimsRegister, ProjectBrief } from '../../contracts/src/index.js';

export interface PolicyViolation {
  code: string;
  category: 'rights' | 'claims' | 'budget' | 'security';
  message: string;
  item_id?: string;
}

export class PolicyChecker {
  /**
   * Verify all assets in the project manifest have approved rights.
   */
  static checkAssets(manifest: AssetManifest, client: string): PolicyViolation[] {
    const violations: PolicyViolation[] = [];

    for (const asset of manifest.assets) {
      if (asset.status !== 'approved') {
        violations.push({
          code: 'ASSET_STATUS_INVALID',
          category: 'rights',
          message: `Asset '${asset.asset_id}' has status '${asset.status}' (must be 'approved'). Evidence: ${asset.rights_evidence}`,
          item_id: asset.asset_id
        });
      }

      if (asset.validity_until) {
        const expiryDate = new Date(asset.validity_until);
        if (expiryDate.getTime() < Date.now()) {
          violations.push({
            code: 'ASSET_EXPIRED',
            category: 'rights',
            message: `Asset '${asset.asset_id}' expired on ${asset.validity_until}`,
            item_id: asset.asset_id
          });
        }
      }

      const permittedClients = asset.permitted.client;
      if (permittedClients !== 'all' && permittedClients !== client) {
        violations.push({
          code: 'ASSET_CLIENT_MISMATCH',
          category: 'rights',
          message: `Asset '${asset.asset_id}' is restricted to client '${permittedClients}', not '${client}'`,
          item_id: asset.asset_id
        });
      }
    }

    return violations;
  }

  /**
   * Check budget constraints:
   * A zero external-media budget prevents paid media-provider calls and fallbacks.
   */
  static checkExternalMediaBudget(brief: ProjectBrief, attemptedCallCost: number): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    if (brief.budgets.media_budget_usd === 0 && attemptedCallCost > 0) {
      violations.push({
        code: 'MEDIA_BUDGET_ZERO_VIOLATION',
        category: 'budget',
        message: `Attempted external paid media call costing $${attemptedCallCost}, but media_budget_usd is 0.00`
      });
    }
    return violations;
  }

  /**
   * Check that all claims referenced in scenes exist in the claims register and have not expired.
   */
  static checkClaims(
    referencedClaimIds: string[],
    register: ClaimsRegister,
    projectLocale: string
  ): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const claimMap = new Map(register.claims.map(c => [c.claim_id, c]));

    for (const claimId of referencedClaimIds) {
      const claim = claimMap.get(claimId);
      if (!claim) {
        violations.push({
          code: 'CLAIM_NOT_FOUND',
          category: 'claims',
          message: `Referenced claim '${claimId}' not found in approved claims register`,
          item_id: claimId
        });
        continue;
      }

      if (claim.locale !== projectLocale) {
        violations.push({
          code: 'CLAIM_LOCALE_MISMATCH',
          category: 'claims',
          message: `Claim '${claimId}' has locale '${claim.locale}', expected '${projectLocale}'`,
          item_id: claimId
        });
      }

      if (claim.expiry) {
        const expiryDate = new Date(claim.expiry);
        if (expiryDate.getTime() < Date.now()) {
          violations.push({
            code: 'CLAIM_EXPIRED',
            category: 'claims',
            message: `Claim '${claimId}' expired on ${claim.expiry}`,
            item_id: claimId
          });
        }
      }
    }

    return violations;
  }
}

