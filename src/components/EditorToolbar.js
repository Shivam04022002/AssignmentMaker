/**
 * Bottom editor toolbar.
 *
 *   options row (for the active tool)
 *     Text    typed-handwriting ink (blue/black) · + Text
 *     Pen     colour · thickness (with live dot preview) · opacity
 *     Marker  colour · width
 *     Eraser  size (with radius preview)
 *   main row
 *     Text · Pen · Marker · Eraser │ Undo · Redo │ Pages
 *
 * Tools are explicit: only the Text tool edits typed text; Pen and Marker
 * draw; the Eraser removes freehand ink only.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PENS } from '../data/pens';
import {
  ERASER_SIZES,
  MARKER_COLORS,
  MARKER_WIDTHS,
  PEN_COLORS,
  PEN_OPACITIES,
  PEN_WIDTHS,
} from '../ink/strokes';
import { colors, radii, spacing } from '../theme/theme';
import {
  EraserIcon,
  MarkerIcon,
  PagesIcon,
  PencilIcon,
  PlusIcon,
  RedoIcon,
  UndoIcon,
} from './Icons';

function ToolButton({ label, active, disabled, onPress, children, testID }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => [
        styles.tool,
        active && styles.toolActive,
        pressed && !disabled && styles.toolPressed,
        disabled && styles.toolDisabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** A small round option chip on the light options row. */
function Option({ label, active, onPress, testID, children, wide }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={3}
      testID={testID}
      style={[
        styles.option,
        wide && styles.optionWide,
        active && styles.optionActive,
      ]}
    >
      {children}
    </Pressable>
  );
}

function Swatch({ color, translucent }) {
  return (
    <View
      style={[
        styles.swatch,
        { backgroundColor: color },
        translucent && styles.translucent,
      ]}
    />
  );
}

function Divider() {
  return <View style={styles.optionDivider} />;
}

function ToolOptions({
  tool,
  pen,
  onPenChange,
  onAddText,
  penSettings,
  onPenSettings,
  markerSettings,
  onMarkerSettings,
  eraserSize,
  onEraserSize,
}) {
  let content = null;
  if (tool === 'text') {
    content = (
      <>
        <Text style={styles.optionLabel}>Ink</Text>
        {PENS.map(p => (
          <Option
            key={p.id}
            label={`${p.label} pen`}
            active={pen === p.id}
            onPress={() => onPenChange(p.id)}
            testID={`toolbar-pen-${p.id}`}
          >
            <Swatch color={p.color} />
          </Option>
        ))}
        <Divider />
        <Option label="Add text" onPress={onAddText} testID="toolbar-add" wide>
          <PlusIcon color={colors.text} size={12} />
          <Text style={styles.optionText}>Text</Text>
        </Option>
      </>
    );
  } else if (tool === 'pen') {
    content = (
      <>
        {PEN_COLORS.map(c => (
          <Option
            key={c.id}
            label={`${c.label} freehand pen`}
            active={penSettings.color === c.color}
            onPress={() => onPenSettings({ color: c.color })}
            testID={`ink-pen-${c.id}`}
          >
            <Swatch color={c.color} />
          </Option>
        ))}
        <Divider />
        {PEN_WIDTHS.map(w => (
          <Option
            key={w}
            label={`${w} pixel pen`}
            active={penSettings.width === w}
            onPress={() => onPenSettings({ width: w })}
            testID={`pen-width-${w}`}
          >
            <View
              style={{
                width: w + 1,
                height: w + 1,
                borderRadius: (w + 1) / 2,
                backgroundColor: penSettings.color,
                opacity: penSettings.opacity,
              }}
            />
          </Option>
        ))}
        <Divider />
        {PEN_OPACITIES.map(o => (
          <Option
            key={o}
            label={`${Math.round(o * 100)} percent opacity`}
            active={penSettings.opacity === o}
            onPress={() => onPenSettings({ opacity: o })}
            testID={`pen-opacity-${Math.round(o * 100)}`}
            wide
          >
            <Text style={styles.optionText}>{Math.round(o * 100)}%</Text>
          </Option>
        ))}
      </>
    );
  } else if (tool === 'marker') {
    content = (
      <>
        {MARKER_COLORS.map(c => (
          <Option
            key={c.id}
            label={`${c.label} marker`}
            active={markerSettings.color === c.color}
            onPress={() => onMarkerSettings({ color: c.color })}
            testID={`marker-${c.id}`}
          >
            <Swatch color={c.color} translucent />
          </Option>
        ))}
        <Divider />
        {MARKER_WIDTHS.map(w => (
          <Option
            key={w}
            label={`${w} pixel marker`}
            active={markerSettings.width === w}
            onPress={() => onMarkerSettings({ width: w })}
            testID={`marker-width-${w}`}
          >
            <View
              style={[
                styles.markerBar,
                {
                  height: Math.round(w / 2),
                  backgroundColor: markerSettings.color,
                },
              ]}
            />
          </Option>
        ))}
      </>
    );
  } else if (tool === 'eraser') {
    content = ERASER_SIZES.map(size => {
      const d = Math.min(18, size.radius);
      return (
        <Option
          key={size.id}
          label={`${size.label} eraser`}
          active={eraserSize === size.id}
          onPress={() => onEraserSize(size.id)}
          testID={`eraser-${size.id}`}
          wide
        >
          <View
            style={[
              styles.eraserDot,
              { width: d, height: d, borderRadius: d / 2 },
            ]}
          />
          <Text style={styles.optionText}>{size.label}</Text>
        </Option>
      );
    });
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.options}
      keyboardShouldPersistTaps="handled"
      testID={`tool-options-${tool}`}
    >
      {content}
    </ScrollView>
  );
}

export default function EditorToolbar({
  tool = 'text',
  onToolChange,
  pen,
  onPenChange,
  editing,
  onToggleEdit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAddText,
  onPages,
  penSettings,
  onPenSettings,
  markerSettings,
  onMarkerSettings,
  eraserSize,
  onEraserSize,
}) {
  const iconColor = colors.onCharcoal;
  const activeColor = colors.charcoal;
  const pick = id => () => onToolChange && onToolChange(id);
  return (
    <View style={styles.wrap}>
      <ToolOptions
        tool={tool}
        pen={pen}
        onPenChange={onPenChange}
        onAddText={onAddText}
        penSettings={penSettings}
        onPenSettings={onPenSettings}
        markerSettings={markerSettings}
        onMarkerSettings={onMarkerSettings}
        eraserSize={eraserSize}
        onEraserSize={onEraserSize}
      />
      <View style={styles.bar} accessibilityRole="toolbar">
        <View style={styles.group}>
          <ToolButton
            label={editing ? 'Finish editing text' : 'Text tool: edit text'}
            active={tool === 'text'}
            onPress={onToggleEdit}
            testID="toolbar-edit"
          >
            <Text
              style={[
                styles.textTool,
                tool === 'text' && styles.textToolActive,
              ]}
            >
              Aa
            </Text>
          </ToolButton>
          <ToolButton
            label="Pen tool: write by hand"
            active={tool === 'pen'}
            onPress={pick('pen')}
            testID="toolbar-tool-pen"
          >
            <PencilIcon color={tool === 'pen' ? activeColor : iconColor} />
          </ToolButton>
          <ToolButton
            label="Marker tool: highlight"
            active={tool === 'marker'}
            onPress={pick('marker')}
            testID="toolbar-tool-marker"
          >
            <MarkerIcon
              color={tool === 'marker' ? activeColor : iconColor}
              tip={markerSettings ? markerSettings.color : undefined}
            />
          </ToolButton>
          <ToolButton
            label="Eraser tool: erase drawing"
            active={tool === 'eraser'}
            onPress={pick('eraser')}
            testID="toolbar-tool-eraser"
          >
            <EraserIcon color={tool === 'eraser' ? activeColor : iconColor} />
          </ToolButton>
        </View>

        <View style={styles.divider} />

        <View style={styles.group}>
          <ToolButton
            label="Undo"
            disabled={!canUndo}
            onPress={onUndo}
            testID="toolbar-undo"
          >
            <UndoIcon color={iconColor} />
          </ToolButton>
          <ToolButton
            label="Redo"
            disabled={!canRedo}
            onPress={onRedo}
            testID="toolbar-redo"
          >
            <RedoIcon color={iconColor} />
          </ToolButton>
          {onPages ? (
            <ToolButton label="Pages" onPress={onPages} testID="toolbar-pages">
              <PagesIcon color={iconColor} />
            </ToolButton>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  options: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xs,
    minHeight: 36,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginRight: 2,
  },
  option: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 6,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionWide: {
    paddingHorizontal: 10,
  },
  optionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  optionDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: 2,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  translucent: {
    opacity: 0.75,
  },
  markerBar: {
    width: 18,
    borderRadius: 2,
    opacity: 0.7,
  },
  eraserDot: {
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: colors.surface,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.charcoal,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginHorizontal: spacing.xs,
  },
  tool: {
    minWidth: 40,
    height: 42,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  toolActive: {
    backgroundColor: colors.onCharcoal,
  },
  toolPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  toolDisabled: {
    opacity: 0.3,
  },
  textTool: {
    color: colors.onCharcoal,
    fontSize: 16,
    fontWeight: '700',
  },
  textToolActive: {
    color: colors.charcoal,
  },
});
