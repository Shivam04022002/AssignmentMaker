import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, shadows } from '../theme/theme';

/** Card with a clear selected state (accent border, tint and check badge). */
export default function SelectableCard({
  selected,
  onPress,
  children,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
  showBadge = true,
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
      {selected && showBadge ? (
        <View style={styles.badge}>
          <View style={styles.check} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.card,
  },
  selected: {
    borderColor: colors.accent,
    backgroundColor: '#F7F9FD',
    ...shadows.raised,
  },
  pressed: {
    opacity: 0.85,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Tick drawn from two borders of a rotated box.
  check: {
    width: 6,
    height: 10,
    marginTop: -2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.onCharcoal,
    transform: [{ rotate: '45deg' }],
  },
});
