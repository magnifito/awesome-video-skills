import { HyperFramesAdapter } from '../hyperframes/index.js';
import type { AdapterCapabilities } from '../interface.js';

/**
 * Standard Seekable HTML Adapter
 * Implements compatibility with standalone window.seek(seconds) animations.
 */
export class HtmlSeekableAdapter extends HyperFramesAdapter {
  override readonly id = 'html';
  override readonly name = 'Standard Seekable HTML Adapter';
  override readonly capabilities: AdapterCapabilities = {
    formats: ['mp4'],
    transparency: false,
    audioMixing: true,
    dynamicInput: true,
    headlessBrowser: true,
    preview: true
  };
}
