/**
 * Editor notice for the built-in handwritings (Lang1–3): they have no
 * Devanagari letters, and draw any Hindi character as a plain placeholder
 * mark. The drawing itself is unchanged (it is locked by the Lang1–3
 * tests); this only says so, instead of leaving the marks unexplained.
 * Personal handwritings report what they cannot write themselves
 * (PersonalDocumentBanner).
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getHandwritingStyle, isPersonalStyleId } from '../data/handwritingStyles';
import { hasGlyph } from '../handwriting/glyphs';

const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/u;

/**
 * Hindi (Devanagari) characters in `text` that the built-in style cannot
 * draw: { count: occurrences, distinct: [characters] }. Empty for personal
 * handwritings and for text without Devanagari.
 */
export function builtInHindiGaps(text, styleId) {
  if (!text || isPersonalStyleId(styleId)) return { count: 0, distinct: [] };
  const style = getHandwritingStyle(styleId);
  const distinct = [];
  let count = 0;
  for (const ch of text) {
    if (!DEVANAGARI.test(ch) || hasGlyph(ch, style.glyphSet)) continue;
    count++;
    if (!distinct.includes(ch)) distinct.push(ch);
  }
  return { count, distinct };
}

export default function BuiltInScriptNotice({ text, styleId }) {
  const gaps = useMemo(() => builtInHindiGaps(text, styleId), [text, styleId]);
  if (!gaps.count) return null;
  const name = getHandwritingStyle(styleId).name;
  return (
    <View style={styles.banner} accessibilityRole="text" testID="builtin-hindi-banner">
      <Text style={styles.text}>
        {name} has no Hindi letters: {gaps.count} Hindi {gaps.count === 1 ? 'character is' : 'characters are'} drawn as plain marks ({gaps.distinct.slice(0, 8).join(' ')}
        {gaps.distinct.length > 8 ? ' …' : ''}). Your text is kept unchanged.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, backgroundColor: '#E4EAF6', borderColor: '#B9CBE3' },
  text: { color: '#22252A', fontSize: 13 },
});
