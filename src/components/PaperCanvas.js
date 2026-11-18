/**
 * A sheet of paper with handwriting on it.
 *
 * Layers (bottom → top): paper colour + grain, ruling (blue rules, red
 * header rule, red margin), handwriting. Grain and ruling stay faint so the
 * ink dominates. Future layers (pen strokes, markers, positioned text boxes)
 * slot in above the handwriting inside the same logical coordinate space.
 *
 * The page is laid out at a fixed logical width (PAGE.width) and scaled to
 * `width`, so wrapping is identical on every device. The page grows in whole
 * lines when the text runs past one sheet.
 */
import React, {
  memo,
  useCallback,
  useState,
  useSyncExternalStore,
} from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { getHandwritingStyle } from '../data/handwritingStyles';
import {
  getPageMetrics,
  getPageType,
  getPaperAppearance,
  getPaperVersion,
  rowHeightFor,
  subscribeToPaper,
} from '../data/paper';
import { getPenColor } from '../data/pens';
import { colors, shadows } from '../theme/theme';
import HandwritingText from './HandwritingText';

const grain = require('../../assets/images/paper-grain.png');

/** Printed stationery: blue rules, red header rule and red margin lines. */
export function Ruling({ height, metrics, ruled, look }) {
  const { padding, lineSpacing, margin } = metrics;
  const rule = {
    height: look.ruleWidth,
    backgroundColor: look.ruleColor,
    opacity: look.ruleOpacity,
  };
  const red = margin && {
    backgroundColor: margin.color,
    opacity: margin.opacity,
  };
  const lines = [];
  if (ruled) {
    for (
      let y = padding.top + lineSpacing;
      y <= height - padding.bottom;
      y += lineSpacing
    ) {
      lines.push(
        <View
          key={y}
          testID="paper-rule"
          style={[styles.rule, rule, { top: y }]}
        />,
      );
    }
  }
  const headerY =
    metrics.headerRuleY ??
    padding.top + lineSpacing - look.headerRuleOffset - lineSpacing;
  return (
    <>
      {lines}
      {margin && metrics.headerRule ? (
        <>
          <View
            testID="paper-header-rule"
            style={[styles.rule, red, { top: headerY, height: margin.width }]}
          />
          <View
            style={[
              styles.rule,
              red,
              { top: headerY + (margin.double || 2.6), height: margin.width },
            ]}
          />
        </>
      ) : null}
      {margin ? (
        <>
          <View
            testID="paper-margin"
            style={[
              styles.marginLine,
              red,
              { left: margin.x, width: margin.width },
            ]}
          />
          {margin.double ? (
            <View
              style={[
                styles.marginLine,
                red,
                { left: margin.x + margin.double, width: margin.width },
              ]}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** Paper surface: colour, grain and printed ruling, at logical size. */
export function PaperBackground({ width, height, metrics, ruled, look }) {
  return (
    <>
      <Image
        source={grain}
        resizeMode="repeat"
        style={[styles.grain, { width, height, opacity: look.grainOpacity }]}
      />
      <Ruling height={height} metrics={metrics} ruled={ruled} look={look} />
    </>
  );
}

function PaperCanvas({
  document,
  width,
  lineSpacing,
  onPress,
  placeholder = 'Tap here to start writing…',
  showPlaceholder = true,
  showGuides = false,
}) {
  useSyncExternalStore(subscribeToPaper, getPaperVersion, getPaperVersion);
  const look = getPaperAppearance();
  const pageType = getPageType(document.pageType);
  const profile = getHandwritingStyle(document.handwritingStyle);
  const metrics = getPageMetrics({
    pageType: pageType.id,
    lineSpacing,
    style: profile,
  });
  const rowHeight = rowHeightFor(pageType, metrics, profile);
  const [contentHeight, setContentHeight] = useState(0);

  const scale = width > 0 ? width / metrics.width : 1;
  // Grow in whole lines so the ruling always ends cleanly.
  const neededLines = Math.ceil(contentHeight / metrics.lineSpacing) + 1;
  const height = Math.max(
    metrics.minHeight,
    metrics.padding.top +
      neededLines * metrics.lineSpacing +
      metrics.padding.bottom,
  );

  const onContentLayout = useCallback(event => {
    setContentHeight(event.nativeEvent.layout.height);
  }, []);

  const isEmpty = !document.content.trim();
  const text = isEmpty && showPlaceholder ? placeholder : document.content;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? 'Paper. Tap to edit text' : undefined}
      style={[styles.sheet, { width, height: height * scale }]}
      testID="paper-canvas"
    >
      <View
        style={[
          styles.page,
          { width: metrics.width, height, transform: [{ scale }] },
        ]}
      >
        <Image
          source={grain}
          resizeMode="repeat"
          style={[
            styles.grain,
            { width: metrics.width, height, opacity: look.grainOpacity },
          ]}
        />
        <Ruling
          height={height}
          metrics={metrics}
          ruled={pageType.ruled}
          look={look}
        />
        <View
          style={[
            styles.content,
            {
              top: metrics.padding.top,
              left: metrics.padding.left,
              width: metrics.contentWidth,
            },
            isEmpty && styles.placeholder,
          ]}
          onLayout={onContentLayout}
        >
          <HandwritingText
            text={text}
            style={document.handwritingStyle}
            color={getPenColor(document.pen)}
            pen={document.pen}
            fontSize={metrics.fontSize}
            lineHeight={rowHeight}
            maxWidth={metrics.contentWidth}
            seed={document.id}
            formatting={document.formatting}
            corrections={document.naturalCorrections === true}
            showGuides={showGuides}
          />
        </View>
      </View>
    </Pressable>
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
  page: {
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'top left',
    backgroundColor: colors.paper,
  },
  grain: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  marginLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  content: {
    position: 'absolute',
  },
  placeholder: {
    opacity: 0.35,
  },
});

export default memo(PaperCanvas);
