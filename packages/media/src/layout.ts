export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SafeZoneBoundary {
  topPercent: number;
  bottomPercent: number;
  rightPercent: number;
  leftPercent: number;
}

export const PLATFORM_SAFE_ZONES: Record<string, SafeZoneBoundary> = {
  tiktok_vertical: {
    topPercent: 0.15,
    bottomPercent: 0.20,
    rightPercent: 0.12,
    leftPercent: 0.05
  },
  reels_vertical: {
    topPercent: 0.14,
    bottomPercent: 0.18,
    rightPercent: 0.10,
    leftPercent: 0.05
  },
  square_feed: {
    topPercent: 0.08,
    bottomPercent: 0.12,
    rightPercent: 0.06,
    leftPercent: 0.06
  },
  standard_landscape: {
    topPercent: 0.05,
    bottomPercent: 0.05,
    rightPercent: 0.05,
    leftPercent: 0.05
  }
};

export interface SafeZoneViolation {
  element_id: string;
  reason: string;
  encroachment_px: number;
}

export class LayoutAuditor {
  /**
   * Check whether a given bounding box violates the mobile safe zone boundaries.
   */
  static checkElementInSafeZone(
    elementId: string,
    elementRect: Rect,
    canvasWidth: number,
    canvasHeight: number,
    format: '9:16' | '16:9' | '1:1' = '9:16',
    platform?: keyof typeof PLATFORM_SAFE_ZONES
  ): SafeZoneViolation[] {
    const violations: SafeZoneViolation[] = [];
    const defaultZoneByFormat: Record<'9:16' | '16:9' | '1:1', string> = {
      '9:16': 'tiktok_vertical',
      '16:9': 'standard_landscape',
      '1:1': 'square_feed'
    };
    const zoneKey = platform ?? defaultZoneByFormat[format];
    const zone = PLATFORM_SAFE_ZONES[zoneKey];
    if (!zone) {
      throw new Error(`Unknown safe zone platform/format: ${String(zoneKey)}`);
    }

    const minX = canvasWidth * zone.leftPercent;
    const maxX = canvasWidth * (1.0 - zone.rightPercent);
    const minY = canvasHeight * zone.topPercent;
    const maxY = canvasHeight * (1.0 - zone.bottomPercent);

    if (elementRect.y < minY) {
      violations.push({
        element_id: elementId,
        reason: `Element encroaches top safe margin (${Math.round(minY)}px)`,
        encroachment_px: Math.round(minY - elementRect.y)
      });
    }

    if (elementRect.y + elementRect.height > maxY) {
      violations.push({
        element_id: elementId,
        reason: `Element encroaches bottom safe margin (${Math.round(canvasHeight - maxY)}px)`,
        encroachment_px: Math.round(elementRect.y + elementRect.height - maxY)
      });
    }

    if (elementRect.x < minX) {
      violations.push({
        element_id: elementId,
        reason: `Element encroaches left safe margin (${Math.round(minX)}px)`,
        encroachment_px: Math.round(minX - elementRect.x)
      });
    }

    if (elementRect.x + elementRect.width > maxX) {
      violations.push({
        element_id: elementId,
        reason: `Element encroaches right safe margin (action buttons)`,
        encroachment_px: Math.round(elementRect.x + elementRect.width - maxX)
      });
    }

    return violations;
  }
}

