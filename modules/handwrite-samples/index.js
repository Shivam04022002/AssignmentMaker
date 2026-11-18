/**
 * Native image input for handwriting samples (see android/ and ios/). The
 * app talks to it through src/handwriting/learn/imageInput.js; this entry
 * only exists so the package resolves as a normal module.
 */
const { NativeModules } = require('react-native');

module.exports = NativeModules.HandWriteSamples || null;
