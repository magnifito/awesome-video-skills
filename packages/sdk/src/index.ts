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
import { TransitionEngine, type TransitionOptions, type TransitionResult } from '../../media/src/transitions.js';
import { ProxyGenerator, type ProxyOptions, type ProxyResult } from '../../media/src/proxy.js';
import { SecurityWatermarker, type WatermarkOptions, type WatermarkResult } from '../../media/src/watermark.js';
import { VideoSpeedEngine, type SpeedOptions, type SpeedResult } from '../../media/src/speed.js';
import { SafeZoneOverlayGenerator, type SafeZoneOverlayOptions } from '../../media/src/safezone_overlay.js';
import { VideoConcatEngine, type ConcatOptions, type TrimOptions, type ConcatResult } from '../../media/src/concat.js';
import { LowerThirdGenerator, type LowerThirdOptions, type LowerThirdResult } from '../../media/src/lower_third.js';
import { ChapterGenerator, type ChapterReport } from '../../media/src/chapters.js';
import { SidechainDuckingEngine, type SidechainOptions, type SidechainResult } from '../../media/src/sidechain.js';
import { VideoLoopEngine, type LoopOptions, type LoopResult } from '../../media/src/loop.js';
import { DeliverySlaTracker, type SlaEvaluation } from '../../media/src/sla.js';
import { FreezeFrameEngine, type FreezeOptions, type FreezeResult } from '../../media/src/freeze.js';
import { MultiTrackAudioMuxer, type AudioTrackInput, type MultiTrackOptions, type MultiTrackResult } from '../../media/src/multitrack.js';
import { AudioSilenceRemover, type SilenceRemoveOptions, type SilenceRemoveResult } from '../../media/src/silence.js';
import { BlurBackgroundEngine, type BlurBgOptions, type BlurBgResult } from '../../media/src/blur_bg.js';
import { CompositionGridGenerator, type GridGuideOptions } from '../../media/src/grid.js';
import { runQualityGate, type QualityGateResult } from '../../cli/src/commands/gate.js';
import { FrameRateConverter, type FrameRateOptions, type FrameRateResult } from '../../media/src/framerate.js';
import { DeinterlaceEngine, type DeinterlaceOptions, type DeinterlaceResult } from '../../media/src/deinterlace.js';
import { AudioEqualizerEngine, type EqOptions, type EqResult } from '../../media/src/equalizer.js';
import { MontageGenerator, type MontageOptions, type MontageResult } from '../../media/src/montage.js';
import { MaskEngine, type MaskBox, type MaskOptions, type MaskResult } from '../../media/src/mask.js';
import { AudioChannelMapper, type ChannelMapOptions, type ChannelMapResult } from '../../media/src/channel_map.js';
import { BitrateOptimizer, type BitrateOptimizeOptions, type BitrateOptimizeResult } from '../../media/src/bitrate.js';
import { MerkleManifest, type MerkleTreeResult } from '../../media/src/merkle.js';
import { AudioResampler, type ResampleOptions, type ResampleResult } from '../../media/src/resampler.js';
import { VideoReverseEngine, type ReverseOptions, type ReverseResult } from '../../media/src/reverse.js';
import { MatteEngine, type MatteOptions, type MatteResult } from '../../media/src/matte.js';
import { SfxSynthesizer, type SfxType, type SfxOptions, type SfxResult } from '../../media/src/sfx.js';
import { MetadataSanitizer, type SanitizeOptions, type SanitizeResult } from '../../media/src/sanitizer.js';
import { ChromaKeyEngine, type ChromaKeyOptions, type ChromaKeyResult } from '../../media/src/chromakey.js';
import { TitleBurner, type TitleOptions, type TitleResult } from '../../media/src/title_burner.js';
import { NoiseGateEngine, type NoiseGateOptions, type NoiseGateResult } from '../../media/src/noise_gate.js';
import { SmartCropEngine, type SmartCropOptions, type SmartCropResult } from '../../media/src/smart_crop.js';
import { AudioPanner, type PannerOptions, type PannerResult } from '../../media/src/panner.js';
import { GlitchEngine, type GlitchOptions, type GlitchResult } from '../../media/src/glitch.js';
import { MultiCamEngine, type MultiCamOptions, type MultiCamResult } from '../../media/src/multicam.js';
import { AudioCompressor, type CompressorOptions, type CompressorResult } from '../../media/src/compressor.js';
import { PipEngine, type PipOptions, type PipResult } from '../../media/src/pip.js';
import { VignetteEngine, type VignetteOptions, type VignetteResult } from '../../media/src/vignette.js';
import { DeClickerEngine, type DeClickOptions, type DeClickResult } from '../../media/src/declick.js';
import { runVerifyBundle, type BundleVerificationResult } from '../../cli/src/commands/verify_bundle.js';
import { runDashboard, type DashboardStatus } from '../../cli/src/commands/dashboard.js';
import { MotionCanvasAdapter, type MotionCanvasExportResult } from '../../../adapters/motion-canvas/index.js';
import type { ProjectContext } from '../../../adapters/interface.js';
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

  transition(clipPaths: string[], options: TransitionOptions = {}): TransitionResult {
    const resolvedClips = clipPaths.map(c => path.isAbsolute(c) ? c : path.resolve(this.workspaceRoot, c));
    return TransitionEngine.composeTransitions(resolvedClips, options);
  }

  proxy(videoPath: string, options: ProxyOptions = {}): ProxyResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return ProxyGenerator.generateProxy(fullPath, options);
  }

  watermark(videoPath: string, options: WatermarkOptions = {}): WatermarkResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return SecurityWatermarker.applyWatermark(fullPath, options);
  }

  speed(videoPath: string, factor: number, options: SpeedOptions = {}): SpeedResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return VideoSpeedEngine.changeSpeed(fullPath, factor, options);
  }

  safeZoneOverlay(videoPath: string, options: SafeZoneOverlayOptions = {}): string {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return SafeZoneOverlayGenerator.applySafeZoneGuide(fullPath, options);
  }

  async verifyBundle(bundlePath: string): Promise<BundleVerificationResult> {
    const fullPath = path.isAbsolute(bundlePath) ? bundlePath : path.resolve(this.workspaceRoot, bundlePath);
    return runVerifyBundle(fullPath);
  }

  async dashboard(): Promise<DashboardStatus> {
    return runDashboard(this.workspaceRoot);
  }

  exportMotionCanvas(context: ProjectContext, outputDir: string): MotionCanvasExportResult {
    const fullOut = path.isAbsolute(outputDir) ? outputDir : path.resolve(this.workspaceRoot, outputDir);
    const adapter = new MotionCanvasAdapter();
    return adapter.exportProject(context, fullOut);
  }

  concat(clipPaths: string[], options: ConcatOptions = {}): ConcatResult {
    const resolvedClips = clipPaths.map(c => path.isAbsolute(c) ? c : path.resolve(this.workspaceRoot, c));
    return VideoConcatEngine.concatClips(resolvedClips, options);
  }

  trim(videoPath: string, options: TrimOptions = {}): string {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return VideoConcatEngine.trimClip(fullPath, options);
  }

  lowerThird(videoPath: string, options: LowerThirdOptions): LowerThirdResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return LowerThirdGenerator.applyLowerThird(fullPath, options);
  }

  chapters(scenePlan: ScenePlan): ChapterReport {
    return ChapterGenerator.generateChapters(scenePlan);
  }

  sidechain(voicePath: string, musicPath: string, options: SidechainOptions = {}): SidechainResult {
    const fullVoice = path.isAbsolute(voicePath) ? voicePath : path.resolve(this.workspaceRoot, voicePath);
    const fullMusic = path.isAbsolute(musicPath) ? musicPath : path.resolve(this.workspaceRoot, musicPath);
    return SidechainDuckingEngine.duckMusicUnderDialogue(fullVoice, fullMusic, options);
  }

  loop(videoPath: string, options: LoopOptions = {}): LoopResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return VideoLoopEngine.createPingPongLoop(fullPath, options);
  }

  sla(brief: any, startedAtIso: string, completedAtIso?: string, targetHours = 24): SlaEvaluation {
    return DeliverySlaTracker.evaluateSla(brief, startedAtIso, completedAtIso, targetHours);
  }

  freeze(videoPath: string, options: FreezeOptions = {}): FreezeResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return FreezeFrameEngine.applyHoldFrame(fullPath, options);
  }

  multitrack(videoPath: string, audioTracks: AudioTrackInput[], options: MultiTrackOptions = {}): MultiTrackResult {
    const fullVideo = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    const resolvedTracks = audioTracks.map(t => ({
      ...t,
      filePath: path.isAbsolute(t.filePath) ? t.filePath : path.resolve(this.workspaceRoot, t.filePath)
    }));
    return MultiTrackAudioMuxer.muxTracks(fullVideo, resolvedTracks, options);
  }

  silence(audioPath: string, options: SilenceRemoveOptions = {}): SilenceRemoveResult {
    const fullPath = path.isAbsolute(audioPath) ? audioPath : path.resolve(this.workspaceRoot, audioPath);
    return AudioSilenceRemover.removeSilence(fullPath, options);
  }

  blurBg(verticalVideoPath: string, options: BlurBgOptions = {}): BlurBgResult {
    const fullPath = path.isAbsolute(verticalVideoPath) ? verticalVideoPath : path.resolve(this.workspaceRoot, verticalVideoPath);
    return BlurBackgroundEngine.adaptToLandscape(fullPath, options);
  }

  grid(videoPath: string, options: GridGuideOptions = {}): string {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return CompositionGridGenerator.applyGrid(fullPath, options);
  }

  async gate(projectDir: string): Promise<QualityGateResult> {
    const fullPath = path.isAbsolute(projectDir) ? projectDir : path.resolve(this.workspaceRoot, projectDir);
    return runQualityGate(fullPath);
  }

  framerate(videoPath: string, options: FrameRateOptions = {}): FrameRateResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return FrameRateConverter.convertFps(fullPath, options);
  }

  deinterlace(videoPath: string, options: DeinterlaceOptions = {}): DeinterlaceResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return DeinterlaceEngine.deinterlace(fullPath, options);
  }

  eq(audioPath: string, options: EqOptions = {}): EqResult {
    const fullPath = path.isAbsolute(audioPath) ? audioPath : path.resolve(this.workspaceRoot, audioPath);
    return AudioEqualizerEngine.applyEq(fullPath, options);
  }

  montage(imagePaths: string[], options: MontageOptions = {}): MontageResult {
    const resolvedImages = imagePaths.map(p => path.isAbsolute(p) ? p : path.resolve(this.workspaceRoot, p));
    return MontageGenerator.createAnimatic(resolvedImages, options);
  }

  mask(videoPath: string, box: MaskBox, options: MaskOptions = {}): MaskResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return MaskEngine.applyRedaction(fullPath, box, options);
  }

  channelMap(audioPath: string, options: ChannelMapOptions = {}): ChannelMapResult {
    const fullPath = path.isAbsolute(audioPath) ? audioPath : path.resolve(this.workspaceRoot, audioPath);
    return AudioChannelMapper.remap(fullPath, options);
  }

  optimizeBitrate(videoPath: string, options: BitrateOptimizeOptions = {}): BitrateOptimizeResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return BitrateOptimizer.optimizeToSize(fullPath, options);
  }

  merkle(dirPath: string): MerkleTreeResult {
    const fullPath = path.isAbsolute(dirPath) ? dirPath : path.resolve(this.workspaceRoot, dirPath);
    return MerkleManifest.computeTree(fullPath);
  }

  resample(audioPath: string, options: ResampleOptions = {}): ResampleResult {
    const fullPath = path.isAbsolute(audioPath) ? audioPath : path.resolve(this.workspaceRoot, audioPath);
    return AudioResampler.resample(fullPath, options);
  }

  reverse(videoPath: string, options: ReverseOptions = {}): ReverseResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return VideoReverseEngine.reverse(fullPath, options);
  }

  matte(videoPath: string, options: MatteOptions = {}): MatteResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return MatteEngine.applyMatte(fullPath, options);
  }

  sfx(type: SfxType, options: SfxOptions = {}): SfxResult {
    return SfxSynthesizer.synthesize(type, options);
  }

  sanitize(mediaPath: string, options: SanitizeOptions = {}): SanitizeResult {
    const fullPath = path.isAbsolute(mediaPath) ? mediaPath : path.resolve(this.workspaceRoot, mediaPath);
    return MetadataSanitizer.sanitize(fullPath, options);
  }

  chromakey(videoPath: string, options: ChromaKeyOptions = {}): ChromaKeyResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return ChromaKeyEngine.composite(fullPath, options);
  }

  title(videoPath: string, options: TitleOptions): TitleResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return TitleBurner.burnTitle(fullPath, options);
  }

  noiseGate(audioPath: string, options: NoiseGateOptions = {}): NoiseGateResult {
    const fullPath = path.isAbsolute(audioPath) ? audioPath : path.resolve(this.workspaceRoot, audioPath);
    return NoiseGateEngine.applyGate(fullPath, options);
  }

  smartCrop(videoPath: string, options: SmartCropOptions = {}): SmartCropResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return SmartCropEngine.crop(fullPath, options);
  }

  pan(audioPath: string, options: PannerOptions = {}): PannerResult {
    const fullPath = path.isAbsolute(audioPath) ? audioPath : path.resolve(this.workspaceRoot, audioPath);
    return AudioPanner.pan(fullPath, options);
  }

  glitch(videoPath: string, options: GlitchOptions = {}): GlitchResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return GlitchEngine.applyGlitch(fullPath, options);
  }

  multiCam(videoPaths: string[], options: MultiCamOptions = {}): MultiCamResult {
    const resolved = videoPaths.map(v => path.isAbsolute(v) ? v : path.resolve(this.workspaceRoot, v));
    return MultiCamEngine.composeSplitScreen(resolved, options);
  }

  compressAudio(audioPath: string, options: CompressorOptions = {}): CompressorResult {
    const fullPath = path.isAbsolute(audioPath) ? audioPath : path.resolve(this.workspaceRoot, audioPath);
    return AudioCompressor.compress(fullPath, options);
  }

  pip(mainVideo: string, overlayVideo: string, options: PipOptions = {}): PipResult {
    const fullMain = path.isAbsolute(mainVideo) ? mainVideo : path.resolve(this.workspaceRoot, mainVideo);
    const fullOverlay = path.isAbsolute(overlayVideo) ? overlayVideo : path.resolve(this.workspaceRoot, overlayVideo);
    return PipEngine.composePip(fullMain, fullOverlay, options);
  }

  vignette(videoPath: string, options: VignetteOptions = {}): VignetteResult {
    const fullPath = path.isAbsolute(videoPath) ? videoPath : path.resolve(this.workspaceRoot, videoPath);
    return VignetteEngine.applyVignette(fullPath, options);
  }

  declick(audioPath: string, options: DeClickOptions = {}): DeClickResult {
    const fullPath = path.isAbsolute(audioPath) ? audioPath : path.resolve(this.workspaceRoot, audioPath);
    return DeClickerEngine.declick(fullPath, options);
  }
}

