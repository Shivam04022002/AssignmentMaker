/**
 * Page overview: thumbnails of every page (drawn by the real PaperPage
 * renderer in its lightweight 'preview' quality), with add, open, move and
 * delete. Move uses explicit left/right buttons — more dependable on React
 * Native than drag-and-drop, and accessible.
 */
import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../theme/theme';
import { PlusIcon } from './Icons';
import PaperPage from './PaperPage';

const GAP = spacing.md;

function Action({ label, onPress, disabled, danger, testID }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.action,
        danger && styles.actionDanger,
        disabled && styles.actionDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, danger && styles.actionTextDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function PagesOverview({
  visible,
  onClose,
  document,
  paged,
  currentPage,
  onOpenPage,
  onAddPage,
  onMovePage,
  onDeletePage,
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [selected, setSelected] = useState(currentPage);
  const [lastCurrent, setLastCurrent] = useState(currentPage);
  if (lastCurrent !== currentPage) {
    // Follow the editor's page when it changes (e.g. after a move).
    setLastCurrent(currentPage);
    setSelected(currentPage);
  }

  if (!visible || !paged) {
    return null;
  }
  const pages = paged.pages;
  const columns = window.width >= 600 ? 4 : 3;
  const thumbWidth = Math.floor(
    (Math.min(window.width, 720) - spacing.lg * 2 - GAP * (columns - 1)) /
      columns,
  );
  const sel = Math.min(selected, pages.length - 1);
  const data = [
    ...pages.map((page, index) => ({ page, index })),
    { add: true },
  ];

  const renderItem = ({ item }) => {
    if (item.add) {
      return (
        <Pressable
          onPress={() => onAddPage(sel)}
          accessibilityRole="button"
          accessibilityLabel={`Add a page after page ${sel + 1}`}
          testID="add-page-button"
          style={[
            styles.addTile,
            { width: thumbWidth, height: thumbWidth * Math.SQRT2 },
          ]}
        >
          <PlusIcon color={colors.textMuted} size={20} />
          <Text style={styles.addText}>Add Page</Text>
        </Pressable>
      );
    }
    const active = item.index === sel;
    return (
      <Pressable
        onPress={() => setSelected(item.index)}
        onLongPress={() => onOpenPage(item.index)}
        accessibilityRole="button"
        accessibilityLabel={`Page ${item.index + 1} of ${pages.length}`}
        accessibilityState={{ selected: active }}
        testID={`page-thumb-${item.index}`}
        style={[styles.thumb, active && styles.thumbActive]}
      >
        <PaperPage
          document={document}
          page={item.page}
          layout={paged.layout}
          metrics={paged.metrics}
          rowHeight={paged.rowHeight}
          width={thumbWidth}
          pageCount={pages.length}
          ink={document.ink ? document.ink[item.page.key] : undefined}
          quality="preview"
          testID={`thumb-page-${item.index}`}
        />
        <Text style={[styles.thumbLabel, active && styles.thumbLabelActive]}>
          Page {item.index + 1}
          {item.index === currentPage ? ' •' : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={typography.title}>Pages</Text>
          <Text style={styles.count}>
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            testID="close-pages"
          >
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <FlatList
          key={`cols-${columns}`}
          data={data}
          numColumns={columns}
          keyExtractor={item => (item.add ? 'add' : item.page.key)}
          renderItem={renderItem}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          initialNumToRender={9}
          windowSize={5}
        />
        <View
          style={[
            styles.actions,
            { paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          <Text style={styles.selectedLabel}>Page {sel + 1}</Text>
          <View style={styles.actionRow}>
            <Action
              label="Open"
              onPress={() => onOpenPage(sel)}
              testID="open-page-button"
            />
            <Action
              label="◀ Move"
              onPress={() => onMovePage(sel, -1)}
              disabled={sel === 0}
              testID="move-page-left"
            />
            <Action
              label="Move ▶"
              onPress={() => onMovePage(sel, 1)}
              disabled={sel >= pages.length - 1}
              testID="move-page-right"
            />
            <Action
              label="Delete"
              danger
              onPress={() => onDeletePage(sel)}
              testID="delete-page-button"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    height: 52,
    gap: spacing.sm,
  },
  count: {
    ...typography.caption,
    flex: 1,
  },
  done: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  grid: {
    padding: spacing.lg,
    gap: GAP,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  row: {
    gap: GAP,
  },
  thumb: {
    padding: 3,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: {
    borderColor: colors.accent,
  },
  thumbLabel: {
    ...typography.caption,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  thumbLabelActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  addTile: {
    margin: 3,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addText: {
    ...typography.caption,
    fontWeight: '600',
  },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  selectedLabel: {
    ...typography.sectionLabel,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDanger: {
    backgroundColor: '#F6E3E1',
  },
  actionDisabled: {
    opacity: 0.4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  actionTextDanger: {
    color: colors.danger,
  },
  pressed: {
    opacity: 0.8,
  },
});
