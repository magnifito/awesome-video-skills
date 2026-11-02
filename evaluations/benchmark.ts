import { performance } from 'node:perf_hooks';
import { TimelineMapper } from '../packages/media/src/timeline.js';
import { TypographyFitter } from '../packages/media/src/typography.js';
import { LocalizationSynchronizer } from '../packages/media/src/localization.js';

export interface BenchmarkMetrics {
  timeline_ops_per_sec: number;
  typography_fits_per_sec: number;
  localization_analyses_per_sec: number;
  total_duration_ms: number;
}

export class BenchmarkRunner {
  static run(): BenchmarkMetrics {
    const start = performance.now();

    // 1. Timeline math throughput
    const timelineStart = performance.now();
    const timelineIterations = 50000;
    const mapper = new TimelineMapper({ numerator: 30, denominator: 1 }, 48000);
    for (let i = 0; i < timelineIterations; i++) {
      mapper.secondsToFrames(i % 120);
      mapper.framesToSamples(i % 1800);
    }
    const timelineDuration = performance.now() - timelineStart;
    const timelineOpsPerSec = Math.round((timelineIterations / (timelineDuration / 1000)));

    // 2. Typography fitting throughput
    const typoStart = performance.now();
    const typoIterations = 5000;
    const testCopy = 'Sub-100ms ultra-low latency video streaming across 40 regions worldwide';
    for (let i = 0; i < typoIterations; i++) {
      TypographyFitter.fitText(testCopy, { cardWidth: 842, cardHeight: 600 });
    }
    const typoDuration = performance.now() - typoStart;
    const typoOpsPerSec = Math.round((typoIterations / (typoDuration / 1000)));

    // 3. Localization synchronization throughput
    const locStart = performance.now();
    const locIterations = 5000;
    const bgCopy = 'Ултраниска латентност под 100ms за видеострийминг в 40 региона';
    for (let i = 0; i < locIterations; i++) {
      LocalizationSynchronizer.synchronizeScenes(testCopy, bgCopy, 5.0, 'en', 'bg');
    }
    const locDuration = performance.now() - locStart;
    const locOpsPerSec = Math.round((locIterations / (locDuration / 1000)));

    const totalDuration = performance.now() - start;

    return {
      timeline_ops_per_sec: timelineOpsPerSec,
      typography_fits_per_sec: typoOpsPerSec,
      localization_analyses_per_sec: locOpsPerSec,
      total_duration_ms: Math.round(totalDuration)
    };
  }
}

if (process.argv[1]?.endsWith('benchmark.ts')) {
  console.log('⚡ Running Magnifito Super Video Performance Benchmark...');
  const res = BenchmarkRunner.run();
  console.log(` • Timeline Math Ops    : ${res.timeline_ops_per_sec.toLocaleString()} ops/sec`);
  console.log(` • Typography Fitting   : ${res.typography_fits_per_sec.toLocaleString()} ops/sec`);
  console.log(` • Localization Analysis: ${res.localization_analyses_per_sec.toLocaleString()} ops/sec`);
  console.log(`\nCompleted in ${res.total_duration_ms}ms.`);
}
