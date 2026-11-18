/**
 * Drawing with a personal (learned) handwriting profile.
 *
 * Chosen by HandwritingText / HandwritingLines when a document's
 * handwritingStyle is personal:<id>@<version>. The reference is resolved to
 * that exact stored version (personalStore); until it arrives nothing is
 * drawn, and if it cannot be used an explicit notice replaces the writing —
 * the text is never drawn in Lang1 or any other handwriting. Units the
 * profile cannot draw appear as dashed markers (personalRenderer).
 * Document formatting (headings, underlines, labels, selected text's colour,
 * pen / marker, size and spacing) is drawn as the personal renderer lays it
 * out; what it cannot draw is listed in the editor banner.
 */
import React, { useMemo, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { getPersonalResolution, getPersonalVersion, subscribePersonal } from '../handwriting/learn/personalStore';
import { layoutPersonalText, personalPaths, personalXHeight } from '../handwriting/learn/personalRenderer';
import { shrinkStyle } from './svgScale';
import { measure } from '../dev/perf';

const PAD = 24; // as HandwritingText

/** The current resolution of a personal reference (re-renders when it changes). */
export function usePersonalResolution(ref) {
  useSyncExternalStore(subscribePersonal, getPersonalVersion, getPersonalVersion);
  return getPersonalResolution(ref);
}

const baselineIn = rowHeight => rowHeight - Math.max(1, rowHeight * 0.05);

export function PersonalUnavailable({ resolution, containerStyle }) {
  if (resolution.status === 'loading') {
    return (
      <View style={containerStyle} testID="personal-handwriting-loading" accessible accessibilityLabel="Loading personal handwriting">
        <Text style={styles.loading}>Loading your handwriting…</Text>
      </View>
    );
  }
  return (
    <View
      style={[styles.notice, containerStyle]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`Personal handwriting unavailable. ${resolution.message}`}
      testID="personal-handwriting-error"
    >
      <Text style={styles.noticeTitle}>Personal handwriting unavailable</Text>
      <Text style={styles.noticeText}>{resolution.message}</Text>
    </View>
  );
}

function Ink({ geometry, color, width, height, renderScale = 1, text, containerStyle }) {
  return (
    <View style={[{ height }, containerStyle]} accessible accessibilityRole="text" accessibilityLabel={text} testID="handwriting-text">
      {geometry.paths.length || geometry.markers.length || (geometry.styled || []).length ? (
        <Svg
          width={(width + PAD * 2) * renderScale}
          height={(height + PAD * 2) * renderScale}
          viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${height + PAD * 2}`}
          style={[styles.ink, shrinkStyle(renderScale)]}
          pointerEvents="none"
          testID="personal-handwriting-ink"
        >
          {(geometry.styled || [])
            .filter(s => s.mode === 'marker')
            .map((s, i) => (
              <Path key={`k${i}`} d={s.d} fill="none" stroke={s.color || color} strokeOpacity={s.alpha} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" testID="personal-marker-stroke" />
            ))}
          {geometry.paths.map((d, i) => (
            <Path key={`p${i}`} d={d} fill="none" stroke={color} strokeWidth={geometry.penWidth} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {(geometry.styled || [])
            .filter(s => s.mode !== 'marker')
            .map((s, i) => (
              <Path key={`s${i}`} d={s.d} fill="none" stroke={s.color || color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" testID="personal-styled-stroke" />
            ))}
          {(geometry.underlines || []).map((u, i) => (
            <Path key={`u${i}`} d={u.d} fill={color} fillOpacity={u.alpha} testID="personal-underline" />
          ))}
          {geometry.markers.map((m, i) => (
            <Rect key={`m${i}`} x={m.x} y={m.y} width={m.w} height={m.h} fill="none" stroke="#c62828" strokeWidth={1} strokeDasharray="3 2" testID="personal-missing-glyph" />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** Personal counterpart of HandwritingLines (lines from paginatePersonal). */
export function PersonalLines({ lines, layout, style: ref, color = '#123A8C', rowHeight, text = '', containerStyle, width, renderScale = 1 }) {
  const resolution = usePersonalResolution(ref);
  const ok = resolution.status === 'ok';
  const xHeight = layout && layout.personal ? layout.personal.xHeight : 0;
  const geometry = useMemo(
    () => (ok && xHeight ? measure('render personal handwriting', () => personalPaths(lines, resolution.profile, { xHeight, rowHeight, baselineInRow: baselineIn(rowHeight) }), lines.length) : null),
    [ok, lines, resolution, xHeight, rowHeight],
  );
  if (!ok) return <PersonalUnavailable resolution={resolution} containerStyle={containerStyle} />;
  if (!geometry) return <View style={containerStyle} />;
  return <Ink geometry={geometry} color={color} width={width || 400} height={lines.length * rowHeight} renderScale={renderScale} text={text} containerStyle={containerStyle} />;
}

/** Personal counterpart of HandwritingText (lays out its own text). */
export function PersonalText({ text = '', style: ref, color = '#123A8C', fontSize = 20, lineHeight, maxWidth, seed = '', containerStyle, renderScale = 1 }) {
  const resolution = usePersonalResolution(ref);
  const ok = resolution.status === 'ok';
  const rowHeight = lineHeight || Math.round(fontSize * 1.4);
  const laid = useMemo(() => {
    if (!ok) return null;
    const xHeight = personalXHeight(resolution.profile, fontSize, rowHeight);
    const result = layoutPersonalText(text, resolution.profile, { xHeight, contentWidth: Number.isFinite(maxWidth) ? maxWidth : Infinity, seed });
    return { ...result, geometry: personalPaths(result.lines, resolution.profile, { xHeight, rowHeight, baselineInRow: baselineIn(rowHeight) }) };
  }, [ok, resolution, text, fontSize, rowHeight, maxWidth, seed]);
  if (!ok) return <PersonalUnavailable resolution={resolution} containerStyle={containerStyle} />;
  return <Ink geometry={laid.geometry} color={color} width={Number.isFinite(maxWidth) ? maxWidth : 400} height={laid.lines.length * rowHeight} renderScale={renderScale} text={text} containerStyle={containerStyle} />;
}

/**
 * Editor banner for a document written in a personal handwriting: loading,
 * unavailable (the text is kept, never shown in another handwriting), or
 * the characters this handwriting cannot write (shown as dashed boxes).
 * Nothing for built-in handwritings.
 */
export function PersonalDocumentBanner({ paged }) {
  const h = paged && paged.handwriting;
  if (!h) return null;
  if (h.status === 'loading') {
    return (
      <View style={[styles.banner, styles.bannerInfo]} testID="personal-handwriting-banner-loading">
        <Text style={styles.bannerText}>Loading your personal handwriting…</Text>
      </View>
    );
  }
  if (h.status !== 'ok') {
    return (
      <View style={[styles.banner, styles.bannerError]} accessibilityRole="alert" testID="personal-handwriting-banner-error">
        <Text style={styles.noticeTitle}>This document’s handwriting is unavailable</Text>
        <Text style={styles.bannerText}>{h.message} Your text is kept; it is not shown in another handwriting.</Text>
      </View>
    );
  }
  const missing = [...new Set((paged.unsupported || []).map(u => u.text))];
  const notes = paged.notes || [];
  if (!missing.length && !notes.length) return null;
  const shown = missing.slice(0, 12).join(' ');
  return (
    <View>
      {missing.length ? (
        <View style={[styles.banner, styles.bannerInfo]} accessibilityRole="text" testID="personal-unsupported-banner">
          <Text style={styles.bannerText}>
            {missing.length} {missing.length === 1 ? 'character isn’t' : 'characters aren’t'} in your handwriting yet and appear as dashed boxes: {shown}
            {missing.length > 12 ? ' …' : ''}
          </Text>
        </View>
      ) : null}
      {notes.length ? (
        <View style={[styles.banner, styles.bannerInfo]} accessibilityRole="text" testID="personal-formatting-banner">
          <Text style={styles.bannerText}>In your handwriting: {notes.join('; ')}.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { color: '#6B6E75', fontSize: 12 },
  banner: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  bannerInfo: { backgroundColor: '#E4EAF6', borderColor: '#B9CBE3' },
  bannerError: { backgroundColor: '#fff5f5', borderColor: '#c62828' },
  bannerText: { color: '#22252A', fontSize: 13 },
  ink: { position: 'absolute', left: -PAD, top: -PAD },
  notice: { borderWidth: 1, borderColor: '#c62828', borderRadius: 6, padding: 8, backgroundColor: '#fff5f5' },
  noticeTitle: { color: '#b71c1c', fontWeight: '600', fontSize: 13 },
  noticeText: { color: '#5d4037', fontSize: 12, marginTop: 2 },
});
