import type { VideoRendererAdapter } from './interface.js';
import { HyperFramesAdapter } from './hyperframes/index.js';
import { HtmlSeekableAdapter } from './html/index.js';
import { RemotionProfileAdapter } from './remotion/index.js';
import { MotionAdapter } from './motion/index.js';

export type EngineId = 'hyperframes' | 'html' | 'remotion' | 'motion';

/**
 * Explicit engine-to-adapter registry. Never silently substitute one engine for another:
 * the adapter recorded in render provenance must be the adapter that actually rendered.
 */
export function getRenderAdapter(engine: EngineId): VideoRendererAdapter {
  switch (engine) {
    case 'hyperframes':
      return new HyperFramesAdapter();
    case 'html':
      return new HtmlSeekableAdapter();
    case 'motion':
      return new MotionAdapter();
    case 'remotion': {
      const adapter = new RemotionProfileAdapter();
      if (!adapter.renderable) {
        throw new Error("Engine 'remotion' is a profile-only adapter and cannot render. Set brief.engine to 'hyperframes' or 'html'.");
      }
      return adapter;
    }
    default: {
      const unknown: never = engine;
      throw new Error(`Unknown render engine: ${String(unknown)}`);
    }
  }
}
