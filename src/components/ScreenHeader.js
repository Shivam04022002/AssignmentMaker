import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme/theme';
import { BackIcon } from './Icons';

export function IconButton({ onPress, label, children, testID, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Top bar: back button, flexible centre, optional right-side actions. */
export default function ScreenHeader({ onBack, children, right }) {
  return (
    <View style={styles.header}>
      <IconButton onPress={onBack} label="Back" testID="back-button">
        <BackIcon color={colors.text} />
      </IconButton>
      <View style={styles.center}>{children}</View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
});
