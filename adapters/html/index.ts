import { HyperFramesAdapter } from '../hyperframes/index.js';
import type { AdapterCapabilities } from '../interface.js';

/**
 * Standard Seekable HTML Adapter
 * Emits a composition exposing window.seek(seconds). Frames are produced by the same
 * static-card pipeline as HyperFrames; the composition itself is not frame-captured.
 */
export class HtmlSeekableAdapter extends HyperFramesAdapter {
  override readonly id = 'html';
  override readonly name = 'Seekable HTML Adapter (static card renderer)';
  override readonly capabilities: AdapterCapabilities = {
    formats: ['mp4'],
    transparency: false,
    audioMixing: true,
    dynamicInput: true,
    headlessBrowser: false,
    preview: true
  };
}

