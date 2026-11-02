import type {
  VideoRendererAdapter,
  AdapterCapabilities,
  ProjectContext,
  RenderOptions,
  AdapterRenderOutput
} from '../interface.js';
import type { MediaProbeResult } from '../../packages/media/src/inspector.js';
import path from 'node:path';
import fs from 'node:fs';

export interface MotionCanvasExportResult {
  projectTsPath: string;
  scenesDir: string;
  scenesCount: number;
  quarantineWarnings: string[];
}

/**
 * Motion Canvas Isolated Profile Adapter
 * Tracks upstream-motion-canvas in registry/upstreams.json.
 * Compiles declarative ScenePlan into Motion Canvas TypeScript 2D scenes without executing untrusted code.
 */
export class MotionCanvasAdapter implements VideoRendererAdapter {
  readonly id = 'motion-canvas';
  readonly name = 'Motion Canvas 2D Vector Adapter';
  readonly capabilities: AdapterCapabilities = {
    formats: ['mp4', 'webm', 'png_sequence'],
    transparency: true,
    audioMixing: false,
    dynamicInput: true,
    headlessBrowser: true,
    preview: true
  };

  async validate(context: ProjectContext): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    if (!context.scenePlan || context.scenePlan.scenes.length === 0) {
      errors.push('Motion Canvas: Scene plan contains zero scenes.');
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export Motion Canvas project files without executing arbitrary external code.
   */
  exportProject(context: ProjectContext, outputDir: string): MotionCanvasExportResult {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const scenesDir = path.join(outputDir, 'scenes');
    if (!fs.existsSync(scenesDir)) {
      fs.mkdirSync(scenesDir, { recursive: true });
    }

    const quarantineWarnings: string[] = [
      'GPL-3.0 License Notice: motion-canvas ffmpeg exporter requires qualification before binary bundling in closed commercial offerings.'
    ];

    const sceneImports: string[] = [];
    const sceneRefs: string[] = [];

    context.scenePlan.scenes.forEach((sc, idx) => {
      const sceneFileName = `scene_${idx + 1}.tsx`;
      const sceneFilePath = path.join(scenesDir, sceneFileName);
      const varName = `scene${idx + 1}`;

      sceneImports.push(`import ${varName} from './scenes/scene_${idx + 1}?scene';`);
      sceneRefs.push(varName);

      const fontFam = (context.brand.fonts && context.brand.fonts[0]?.family) || 'Inter';
      const copyText = (sc.copy_text || '').replace(/'/g, "\\'");

      const sceneContent = `import { makeScene2D, Txt, Rect, all } from '@motion-canvas/2d';
import { createRef, easeInOutCubic } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const box = createRef<Rect>();
  const text = createRef<Txt>();

  view.add(
    <Rect
      ref={box}
      width={view.width}
      height={view.height}
      fill={'${context.brand.colors.background || '#0F172A'}'}
    >
      <Txt
        ref={text}
        text={'${copyText}'}
        fill={'${context.brand.colors.primary || '#FFFFFF'}'}
        fontFamily={'${fontFam}'}
        fontSize={44}
      />
    </Rect>
  );

  yield* all(
    text().scale(1.1, ${sc.duration_seconds.toFixed(2)}, easeInOutCubic)
  );
});
`;
      fs.writeFileSync(sceneFilePath, sceneContent);
    });

    const projectTsPath = path.join(outputDir, 'project.ts');
    const projectTsContent = `import { makeProject } from '@motion-canvas/core';
${sceneImports.join('\n')}

export default makeProject({
  scenes: [${sceneRefs.join(', ')}],
});
`;
    fs.writeFileSync(projectTsPath, projectTsContent);

    return {
      projectTsPath,
      scenesDir,
      scenesCount: context.scenePlan.scenes.length,
      quarantineWarnings
    };
  }

  async renderStill(context: ProjectContext, frameNumber: number, options: RenderOptions): Promise<string> {
    throw new Error('Motion Canvas rendering requires isolated Vite build environment. Use exportProject to generate TypeScript scenes.');
  }

  async renderVideo(context: ProjectContext, options: RenderOptions): Promise<AdapterRenderOutput> {
    throw new Error('Motion Canvas video rendering requires isolated container runner.');
  }

  async inspectOutput(outputPath: string): Promise<MediaProbeResult> {
    throw new Error('Output not produced directly by isolated adapter.');
  }
}
