/**
 * Native exporter module (see android/ and ios/). The app talks to it
 * through src/export/nativeExporter.js; this entry only exists so the
 * package resolves as a normal module.
 */
const { NativeModules } = require('react-native');

module.exports = NativeModules.HandWriteExport || null;
