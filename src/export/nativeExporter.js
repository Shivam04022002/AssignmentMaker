/**
 * Thin wrapper over the in-app native exporter (modules/handwrite-export).
 * Swappable for tests via setNativeExporter().
 */
import { NativeModules } from 'react-native';

let override = null;

export function setNativeExporter(next) {
  override = next;
}

export function getNativeExporter() {
  return override || NativeModules.HandWriteExport || null;
}

export function isExportAvailable() {
  return !!getNativeExporter();
}

function requireExporter() {
  const exporter = getNativeExporter();
  if (!exporter) {
    throw new Error('Export is not available in this build of the app.');
  }
  return exporter;
}

export function getExportDirectory() {
  return requireExporter().getExportDirectory();
}

export function beginPdf(path, width, height) {
  return requireExporter().beginPdf(path, width, height);
}

export function addPdfPage(jobId, viewTag) {
  return requireExporter().addPdfPage(jobId, viewTag);
}

export function finishPdf(jobId) {
  return requireExporter().finishPdf(jobId);
}

export function cancelPdf(jobId) {
  const exporter = getNativeExporter();
  if (exporter && jobId) {
    exporter.cancelPdf(jobId);
  }
}

export function captureView(viewTag, path, format, pixelWidth, quality) {
  return requireExporter().captureView(
    viewTag,
    path,
    format,
    pixelWidth,
    quality,
  );
}

export function shareFiles(paths, mimeType, title) {
  return requireExporter().share(paths, mimeType, title);
}
