import { dailyPhases, type TimelineResult, type TimelineSettings } from "./timeline";

/** State interpolation is a display approximation; simulation and scores never use it. */
export function playbackState(run: TimelineResult, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > run.elapsedSeconds) return null;
  let lo = 0;
  let hi = run.points.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (run.points[mid].elapsedSeconds <= seconds) lo = mid + 1;
    else hi = mid;
  }
  const point = run.points[Math.max(0, lo - 1)];
  if (!point) return null;
  const next = run.points[lo];
  const fraction =
    next && next.elapsedSeconds > point.elapsedSeconds
      ? (seconds - point.elapsedSeconds) / (next.elapsedSeconds - point.elapsedSeconds)
      : 0;
  const interpolate = (a: number, b: number | undefined) => a + ((b ?? a) - a) * fraction;
  return {
    ...point,
    excessHeatJ: interpolate(point.excessHeatJ, next?.excessHeatJ),
    heatEquivalentC: interpolate(point.heatEquivalentC, next?.heatEquivalentC),
    fluidDeficitL: interpolate(point.fluidDeficitL, next?.fluidDeficitL),
    fluidDeficitPercent: interpolate(point.fluidDeficitPercent, next?.fluidDeficitPercent),
    interpolated: fraction > 0,
  };
}
export function playbackPhase(settings: TimelineSettings, seconds: number) {
  const phases = dailyPhases(settings);
  const local = Math.min(seconds, settings.days * 86400 - 0.00001) % 86400;
  let end = 0;
  for (const [index, phase] of phases.entries()) {
    end += phase.hours * 3600;
    if (local < end) return { ...phase, index };
  }
  return { ...phases[phases.length - 1], index: phases.length - 1 };
}
