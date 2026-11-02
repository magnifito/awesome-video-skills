import type { MediaProbeResult } from '../packages/media/src/inspector.js';
import type {
  ProjectBrief,
  BrandProfile,
  ClaimsRegister,
  AssetManifest,
  ScenePlan,
  RenderSettings
} from '../packages/contracts/src/index.js';

export interface AdapterCapabilities {
  formats: ('mp4' | 'webm' | 'mov_prores' | 'png_sequence')[];
  transparency: boolean;
  audioMixing: boolean;
  dynamicInput: boolean;
  headlessBrowser: boolean;
  preview: boolean;
}

export interface ProjectContext {
  projectDir: string;
  brief: ProjectBrief;
  brand: BrandProfile;
  claims: ClaimsRegister;
  assets: AssetManifest;
  scenePlan: ScenePlan;
}

export interface RenderOptions {
  settings: RenderSettings;
  outputDir: string;
  runId: string;
  requestHash: string;
}

export interface AdapterRenderOutput {
  outputPath: string;
  format: string;
  fileSizeBytes: number;
  outputHash: string;
  measurements: MediaProbeResult & {
    measured_loudness_lufs?: number;
    measured_true_peak_db?: number;
  };
  logs: string[];
}

export interface VideoRendererAdapter {
  readonly id: string;
  readonly name: string;
  readonly capabilities: AdapterCapabilities;

  validate(context: ProjectContext): Promise<{ valid: boolean; errors: string[] }>;
  renderStill(context: ProjectContext, frameNumber: number, options: RenderOptions): Promise<string>;
  renderVideo(context: ProjectContext, options: RenderOptions): Promise<AdapterRenderOutput>;
  inspectOutput(outputPath: string): Promise<MediaProbeResult>;
}

