import { safeZoneFor, type SafeZonePlatform } from '../../contracts/src/index.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SafeZoneViolation {
  element_id: string;
  reason: string;
  encroachment_px: number;
}

export class LayoutAuditor {
  /**
   * Checks a box against the platform UI margins of the delivery floor (see `safeZoneFor`).
   * The aspect comes from the canvas size; `platform` only matters for 9:16.
   */
  static checkElementInSafeZone(
    elementId: string,
    elementRect: Rect,
    canvasWidth: number,
    canvasHeight: number,
    platform: SafeZonePlatform = 'generic'
  ): SafeZoneViolation[] {
    const zone = safeZoneFor(canvasWidth, canvasHeight, platform);
    const violations: SafeZoneViolation[] = [];
    const push = (side: string, limit: number, over: number) => {
      if (over > 0.5) {
        violations.push({ element_id: elementId, reason: `inside the ${side} UI zone (${Math.round(limit)} px)`, encroachment_px: Math.round(over) });
      }
    };
    push('top', zone.top, zone.top - elementRect.y);
    push('bottom', zone.bottom, elementRect.y + elementRect.height - (canvasHeight - zone.bottom));
    push('left', zone.left, zone.left - elementRect.x);
    push('right', zone.right, elementRect.x + elementRect.width - (canvasWidth - zone.right));
    return violations;
  }
}
