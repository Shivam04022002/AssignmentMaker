/**
 * On-device timings for the validation tools: how long layout, pagination,
 * handwriting rendering, ink grouping and export pages take on the actual
 * phone. Recording is a no-op unless the validation tools are on, so
 * normal builds pay nothing.
 */
import { VALIDATION_TOOLS } from './flags';

const MAX_SAMPLES = 200;
const samples = new Map(); // label → [{ ms, size }]
let enabled = VALIDATION_TOOLS;

export function setPerfEnabled(on) {
  enabled = !!on;
}

const now = () =>
  global.performance && global.performance.now
    ? global.performance.now()
    : Date.now();

/** Runs fn, recording its duration under `label` (size: e.g. characters). */
export function measure(label, fn, size) {
  if (!enabled) {
    return fn();
  }
  const start = now();
  const result = fn();
  record(label, now() - start, size);
  return result;
}

export function record(label, ms, size) {
  if (!enabled) {
    return;
  }
  let list = samples.get(label);
  if (!list) {
    list = [];
    samples.set(label, list);
  }
  list.push({ ms, size });
  if (list.length > MAX_SAMPLES) {
    list.shift();
  }
}

/** Per label: count, median, 95th percentile and max (ms), last size. */
export function perfSummary() {
  return Array.from(samples.entries()).map(([label, list]) => {
    const ms = list.map(s => s.ms).sort((a, b) => a - b);
    const at = q => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))];
    const r = v => Math.round(v * 10) / 10;
    return {
      label,
      count: ms.length,
      median: r(at(0.5)),
      p95: r(at(0.95)),
      max: r(ms[ms.length - 1]),
      size: list[list.length - 1].size,
    };
  });
}

export function resetPerf() {
  samples.clear();
}
