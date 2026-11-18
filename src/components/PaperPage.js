/**
 * One physical page of a document, exactly as it will be printed/exported:
 * fixed page size (PAGE.width × A-series height), paper background, the
 * page's own lines of handwriting and an optional handwritten page number.
 *
 * Layers: paper → marker ink → typed handwriting → pen ink → page number,
 * plus an optional `overlay` (the drawing surface) on top in screen space.
 *
 * Used for the editor's current page, page thumbnails (quality 'preview')
 * and export (`bare`, at logical size, captured by the native exporter) —
 * one renderer for every surface.
 */
import React, { forwardRef, memo, useMemo, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  getPaperAppearance,
  getPaperVersion,
  getPageType,
  subscribeToPaper,
} from '../data/paper';
import { getPenColor } from '../data/pens';
import { colors, shadows } from '../theme/theme';
import InkLayer from '../ink/InkLayer';
import HandwritingText, { HandwritingLines } from './HandwritingText';
import { PaperBackground } from './PaperCanvas';
import { renderScaleFor } from './svgScale';

function PaperPage(
  {
    document,
    page,
    layout,
    metrics,
    rowHeight,
    width,
    pageCount = 1,
    onPress,
    quality = 'full',
    showGuides = false,
    bare = false,
    placeholder,
    ink,
    overlay,
    renderScale: renderScaleProp,
    testID = 'paper-page',
  },
  ref,
) {
  useSyncExternalStore(subscribeToPaper, getPaperVersion, getPaperVersion);
  const look = getPaperAppearance();
  const pageType = getPageType(document.pageType);
  const height = metrics.minHeight;
  const scale = width > 0 ? width / metrics.width : 1;
  const color = getPenColor(document.pen);
  const isEmpty = !page.text.trim();
  const thumbnail = quality === 'preview';
  // Native SVG bitmaps at the size the page is shown (or exported) at.
  const renderScale =
    renderScaleProp || renderScaleFor(scale, metrics.width, height);
  // Highlighter sits under the writing (text stays readable, as on paper);
  // pen ink sits on top of it.
  const [markerInk, penInk] = useMemo(() => {
    const strokes = ink || [];
    return [
      strokes.filter(st => st.tool === 'marker'),
      strokes.filter(st => st.tool !== 'marker'),
    ];
  }, [ink]);

  const content = (
    <View
      style={[
        styles.page,
        {
          width: metrics.width,
          height,
          transform: scale === 1 ? undefined : [{ scale }],
        },
      ]}
    >
      <PaperBackground
        width={metrics.width}
        height={height}
        metrics={metrics}
        ruled={pageType.ruled}
        look={look}
      />
      <InkLayer
        strokes={markerInk}
        width={metrics.width}
        height={height}
        thumbnail={thumbnail}
        renderScale={renderScale}
        testID="ink-marker"
      />
      <View
        style={[
          styles.content,
          {
            top: metrics.padding.top,
            left: metrics.padding.left,
            width: metrics.contentWidth,
          },
        ]}
      >
        {isEmpty && placeholder ? (
          <HandwritingText
            text={placeholder}
            style={document.handwritingStyle}
            color={color}
            pen={document.pen}
            fontSize={metrics.fontSize}
            lineHeight={rowHeight}
            maxWidth={metrics.contentWidth}
            seed={document.id}
            quality={quality}
            renderScale={renderScale}
            containerStyle={styles.placeholder}
          />
        ) : (
          <HandwritingLines
            lines={page.lines}
            layout={layout}
            style={document.handwritingStyle}
            color={color}
            pen={document.pen}
            rowHeight={rowHeight}
            text={page.text}
            quality={quality}
            showGuides={showGuides}
            width={metrics.contentWidth}
            renderScale={renderScale}
          />
        )}
      </View>
      <InkLayer
        strokes={penInk}
        width={metrics.width}
        height={height}
        thumbnail={thumbnail}
        renderScale={renderScale}
        testID="ink-pen"
      />
      {document.pageNumbers ? (
        <View
          style={[
            styles.pageNumber,
            {
              top: height - metrics.padding.bottom + 2,
              right: metrics.padding.right,
            },
          ]}
          testID="page-number"
        >
          <HandwritingText
            text={`${page.number}`}
            style={document.handwritingStyle}
            color={color}
            pen={document.pen}
            fontSize={metrics.fontSize * 0.8}
            lineHeight={metrics.padding.bottom - 6}
            maxWidth={60}
            seed={`${document.id}|page-number`}
            pageId={page.sheetId}
            quality={quality}
            renderScale={renderScale}
          />
        </View>
      ) : null}
    </View>
  );

  const frame = [
    bare ? styles.bare : styles.sheet,
    { width: metrics.width * scale, height: height * scale },
  ];

  if (onPress) {
    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Page ${page.number} of ${pageCount}. Tap to edit text`}
        style={frame}
        collapsable={false}
        testID={testID}
      >
        {content}
        {overlay}
      </Pressable>
    );
  }
  return (
    <View ref={ref} style={frame} collapsable={false} testID={testID}>
      {content}
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.paper,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.paperEdge,
    overflow: 'hidden',
    ...shadows.paper,
  },
  bare: {
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  page: {
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'top left',
    backgroundColor: colors.paper,
  },
  content: {
    position: 'absolute',
  },
  placeholder: {
    opacity: 0.35,
  },
  pageNumber: {
    position: 'absolute',
    width: 60,
    alignItems: 'flex-end',
  },
});

export default memo(forwardRef(PaperPage));
