import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HandwritingStyleSelector from '../components/HandwritingStyleSelector';
import PageTypeSelector from '../components/PageTypeSelector';
import PenSelector from '../components/PenSelector';
import ScreenHeader from '../components/ScreenHeader';
import { DEFAULT_HANDWRITING_STYLE } from '../data/handwritingStyles';
import { DEFAULT_PAGE_TYPE } from '../data/paper';
import { DEFAULT_PEN } from '../data/pens';
import { createDocument } from '../models/document';
import { colors, radii, shadows, spacing, typography } from '../theme/theme';

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {children}
    </View>
  );
}

export default function NewDocumentScreen({ onBack, onCreate }) {
  const insets = useSafeAreaInsets();
  const [pageType, setPageType] = useState(DEFAULT_PAGE_TYPE);
  const [pen, setPen] = useState(DEFAULT_PEN);
  // One handwriting: the reference handwriting.
  const [handwritingStyle, setHandwritingStyle] = useState(
    DEFAULT_HANDWRITING_STYLE,
  );

  const create = () => {
    onCreate(createDocument({ pageType, pen, handwritingStyle }));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader onBack={onBack}>
        <Text style={styles.title}>New Document</Text>
      </ScreenHeader>

      <ScrollView style={styles.list} contentContainerStyle={styles.content}>
        <Section title="Page Type">
          <PageTypeSelector value={pageType} onChange={setPageType} />
        </Section>
        <Section title="Pen">
          <PenSelector value={pen} onChange={setPen} />
        </Section>
        <Section title="Handwriting">
          <HandwritingStyleSelector
            value={handwritingStyle}
            pen={pen}
            onChange={setHandwritingStyle}
          />
        </Section>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
      >
        <Pressable
          onPress={create}
          accessibilityRole="button"
          testID="create-document-button"
          style={({ pressed }) => [
            styles.createButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.createText}>Create Document</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.title,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg + 4,
    paddingBottom: spacing.xl,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.sectionLabel,
    marginBottom: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg + 4,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  createButton: {
    height: 54,
    borderRadius: radii.lg,
    backgroundColor: colors.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    ...shadows.card,
  },
  pressed: {
    opacity: 0.88,
  },
  createText: {
    color: colors.onCharcoal,
    fontSize: 16,
    fontWeight: '600',
  },
});
