import type {
  VideoRendererAdapter,
  AdapterCapabilities,
  ProjectContext,
  RenderOptions,
  AdapterRenderOutput
} from '../interface.js';
import type { MediaProbeResult } from '../../packages/media/src/inspector.js';

/**
 * Isolated Remotion Profile Adapter
 * As specified in Section 5 & 11:
 * "One isolated Remotion production profile is a separately estimated follow-on,
 * contingent on licensing and its initial render fixture; creating its registry entry
 * and adapter contract is included, implementing it is not."
 */
export class RemotionProfileAdapter implements VideoRendererAdapter {
  readonly id = 'remotion';
  readonly name = 'Remotion Isolated Profile Adapter';
  readonly capabilities: AdapterCapabilities = {
    formats: ['mp4', 'webm'],
    transparency: true,
    audioMixing: true,
    dynamicInput: true,
    headlessBrowser: true,
    preview: true
  };

  async validate(context: ProjectContext): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    if (!context.brief.budgets || context.brief.budgets.compute_budget_usd < 5) {
      errors.push('Remotion profile requires minimum compute budget of $5.00 for isolated container worker.');
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async renderStill(context: ProjectContext, frameNumber: number, options: RenderOptions): Promise<string> {
    throw new Error('Remotion renderer profile is a tracked follow-on requiring isolated React container execution.');
  }

  async renderVideo(context: ProjectContext, options: RenderOptions): Promise<AdapterRenderOutput> {
    throw new Error(
      'Remotion execution profile is isolated from the default baseline. Use HyperFrames adapter for default production or qualify Remotion worker environment.'
    );
  }

  async inspectOutput(outputPath: string): Promise<MediaProbeResult> {
    throw new Error('inspectOutput called on uninitialized Remotion adapter');
  }
}
