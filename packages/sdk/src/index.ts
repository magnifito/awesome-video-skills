import path from 'node:path';
import { runPlan } from '../../cli/src/commands/plan.js';
import { runRender, type RenderCliOptions } from '../../cli/src/commands/render.js';
import { runValidate, type ValidationReport } from '../../cli/src/commands/validate.js';
import { runPackage, type PackageOutput } from '../../cli/src/commands/package.js';
import { generateDeliveryReport, type DeliveryReport } from '../../cli/src/commands/report.js';
import { compareRenderOutputs, type DiffReport } from '../../cli/src/commands/diff.js';
import { generateStoryboardContactSheet, type StoryboardResult } from '../../cli/src/commands/storyboard.js';
import { runClean, type CleanResult, type CleanOptions } from '../../cli/src/commands/clean.js';
import { ThumbnailGenerator, type ThumbnailResult, type ThumbnailOptions } from '../../media/src/thumbnail.js';
import { AspectReframeEngine, type ReframeResult, type ReframeOptions } from '../../media/src/reframe.js';
import { ColorPresetEngine, type ColorPresetName, type ApplyGradeResult } from '../../media/src/color_presets.js';
import { AudioWaveformVisualizer, type WaveformResult, type WaveformOptions } from '../../media/src/waveform.js';
import { SubtitleEmbedder, type SubtitleTrackConfig, type EmbedSubtitlesResult } from '../../media/src/subtitles_embedder.js';
import { StemExporter, type StemTrackInput, type StemExportReport } from '../../media/src/stems.js';
import { ProductionBundleExporter, type BundleOptions, type BundleSummary } from '../../media/src/bundle.js';
import { ContractMigrator, type MigrationSummary } from '../../contracts/src/migrate.js';
import { AssetAuditor, type AssetManifestAuditReport } from '../../media/src/asset_auditor.js';
import { FontAuditor, type FontAuditResult } from '../../media/src/font_auditor.js';
import { AudioCatalogManager, type AudioTrack } from '../../media/src/audio_catalog.js';
import type { ScenePlan, RenderResult } from '../../contracts/src/index.js';

export interface EngineRenderOptions extends RenderCliOptions {
  format?: '9:16' | '16:9' | '1:1';
}

export class MagnifitoVideoEngine {
  constructor(public readonly workspaceRoot: string = process.cwd()) {}

  async plan(projectDir: string): Promise<ScenePlan> {
    const fullPath = path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir);
    return runPlan(fullPath);
  }

  async render(projectDir: string, options: EngineRenderOptions = {}): Promise<RenderResult> {
    const fullPath = path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir);
    return runRender(fullPath, options);
  }

  async validate(runPathOrId: string, projectDir?: string): Promise<ValidationReport> {
    const fullProjDir = projectDir
      ? (path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir))
      : undefined;
    return runValidate(runPathOrId, fullProjDir);
  }

  async package(runPathOrId: string, projectDir?: string, reviewer = 'Kiril Kirov'): Promise<PackageOutput> {
    const fullProjDir = projectDir
      ? (path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir))
      : undefined;
    return runPackage(runPathOrId, fullProjDir, reviewer);
  }

  async report(projectDir: string, runId?: string): Promise<{
    report: DeliveryReport;
    markdownPath: string;
    jsonPath: string;
  }> {
    const fullPath = path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir);
    return generateDeliveryReport(fullPath, runId);
  }

  async diff(targetA: string, targetB: string): Promise<DiffReport> {
    const fullA = path.isAbsolute(targetA) ? targetA : path.resolve(this.workspaceRoot, targetA);
    const fullB = path.isAbsolute(targetB) ? targetB : path.resolve(this.workspaceRoot, targetB);
    return compareRenderOutputs(fullA, fullB);
  }

  migrate(projectDir: string): MigrationSummary {
    const fullPath = path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir);
    return ContractMigrator.migrateProject(fullPath);
  }

  auditAssets(projectDir: string): AssetManifestAuditReport {
    const fullPath = path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir);
    return AssetAuditor.auditManifest(fullPath);
  }

  auditFont(text: string, fontFamily: string, fontFilePath?: string): FontAuditResult {
    return FontAuditor.auditFontCoverage(text, fontFamily, fontFilePath);
  }

  listAudioTracks(category?: AudioTrack['category'], mood?: AudioTrack['mood']): AudioTrack[] {
    return AudioCatalogManager.listTracks(category, mood);
  }

  async storyboard(projectDir: string, options: { format?: '16:9' | '9:16' | '1:1'; outDir?: string } = {}): Promise<StoryboardResult> {
    const fullPath = path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir);
    return generateStoryboardContactSheet(fullPath, options);
  }

  async clean(projectDir: string, options: CleanOptions = {}): Promise<CleanResult> {
    const fullPath = path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir);
    return runClean(fullPath, options);
  }

  thumbnail(videoPath: string, options: ThumbnailOptions = {}): ThumbnailResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return ThumbnailGenerator.extractThumbnail(fullPath, options);
  }

  reframe(videoPath: string, options: ReframeOptions): ReframeResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return AspectReframeEngine.reframe(fullPath, options);
  }

  grade(videoPath: string, preset: ColorPresetName, options: { outputPath?: string } = {}): ApplyGradeResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return ColorPresetEngine.applyGrade(fullPath, preset, options);
  }

  waveform(mediaPath: string, options: WaveformOptions = {}): WaveformResult {
    const fullPath = path.isAbsolute(mediaPath) ? mediaPath : path.resolve(this.workspaceRoot, mediaPath);
    return AudioWaveformVisualizer.generateWaveform(fullPath, options);
  }

  embedSubtitles(videoPath: string, tracks: SubtitleTrackConfig[], options: { outputPath?: string } = {}): EmbedSubtitlesResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return SubtitleEmbedder.embed(fullPath, tracks, options);
  }

  exportStems(tracks: StemTrackInput[], outputDir: string): StemExportReport {
    const fullOut = path.isAbsolute(outputDir) ? outputDir : path.resolve(this.workspaceRoot, outputDir);
    return StemExporter.exportStems(tracks, fullOut);
  }

  bundle(deliveryDir: string, options: BundleOptions = {}): BundleSummary {
    const fullOut = path.isAbsolute(deliveryDir) ? deliveryDir : path.resolve(this.workspaceRoot, deliveryDir);
    return ProductionBundleExporter.createBundle(fullOut, options);
  }
}

