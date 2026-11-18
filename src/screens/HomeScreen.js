import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HandwritingText from '../components/HandwritingText';
import { PlusIcon } from '../components/Icons';
import { getHandwritingStyle, isPersonalStyleId } from '../data/handwritingStyles';
import { purgeOrphanedVersions } from '../handwriting/learn/profileRepository';
import { VALIDATION_RELEASE } from '../dev/flags';
import { getPageType } from '../data/paper';
import { getPenColor } from '../data/pens';
import { deleteDocument, listDocuments } from '../storage/documentStorage';
import { colors, radii, shadows, spacing, typography } from '../theme/theme';
import { formatRelativeTime } from '../utils/format';
import { PAGE_BREAK } from '../utils/pagination';

function MiniPage({ document }) {
  const ruled = getPageType(document.pageType).ruled;
  // First page only (pages are separated by page breaks).
  const firstLines = document.content
    .split(PAGE_BREAK)[0]
    .trim()
    .split('\n')
    .slice(0, 4)
    .join('\n');
  return (
    <View style={styles.miniPage}>
      {ruled
        ? [0, 1, 2, 3, 4, 5].map(i => (
            <View key={i} style={[styles.miniRule, { top: 14 + i * 12 }]} />
          ))
        : null}
      <HandwritingText
        text={firstLines}
        style={document.handwritingStyle}
        color={getPenColor(document.pen)}
        pen={document.pen}
        fontSize={9}
        lineHeight={12}
        maxWidth={52}
        seed={document.id}
        corrections={document.naturalCorrections === true}
        containerStyle={styles.miniText}
      />
    </View>
  );
}

function DocumentCard({ document, onPress, onLongPress }) {
  const preview = document.content.trim().replace(/\s+/g, ' ');
  const sheets = document.content.split(PAGE_BREAK).length;
  const style = getHandwritingStyle(document.handwritingStyle);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${document.title}`}
      accessibilityHint="Long press to delete"
      testID={`document-card-${document.id}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <MiniPage document={document} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {document.title}
        </Text>
        <Text style={styles.cardPreview} numberOfLines={2}>
          {preview || 'Empty page'}
        </Text>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.inkDot,
              { backgroundColor: getPenColor(document.pen) },
            ]}
          />
          <Text style={styles.meta} numberOfLines={1}>
            {style.name} ·{' '}
            {getPageType(document.pageType).label.replace(' Page', '')} ·{' '}
            {sheets > 1 ? `${sheets} pages · ` : ''}
            {formatRelativeTime(document.updatedAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty} testID="home-empty-state">
      <View style={styles.emptyPage}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[styles.emptyRule, { top: 18 + i * 11 }]} />
        ))}
      </View>
      <Text style={styles.emptyTitle}>No documents yet</Text>
      <Text style={styles.emptyText}>
        Create your first page and watch your words turn into handwriting.
      </Text>
    </View>
  );
}

/** Removes versions of deleted handwritings no document uses any more (never blocks Home). */
function tidyProfiles() {
  purgeOrphanedVersions().catch(error => console.warn('[HandWrite] Could not tidy handwriting profiles', error));
}

export default function HomeScreen({
  onNewDocument,
  onOpenDocument,
  onOpenTuner,
  onCreateHandwriting, // optional: Create My Handwriting (see dev/flags.js)
  onOpenProfiles, // optional: My Handwritings (same flag)
}) {
  const insets = useSafeAreaInsets();
  const [documents, setDocuments] = useState(null);

  const load = useCallback(async () => {
    try {
      setDocuments(await listDocuments());
    } catch (error) {
      console.warn('[HandWrite] Could not load documents', error);
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    load();
    // Versions of deleted handwritings left by earlier deletions (before Phase 17).
    tidyProfiles();
  }, [load]);

  const confirmDelete = useCallback(
    document => {
      Alert.alert('Delete document?', `“${document.title}” will be removed.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDocument(document.id);
            } catch (error) {
              Alert.alert('Could not delete', 'The document is unchanged. Please try again.');
              return;
            }
            if (isPersonalStyleId(document.handwritingStyle)) {
              tidyProfiles();
            }
            load();
          },
        },
      ]);
    },
    [load],
  );

  const header = (
    <View>
      {/* Development builds: long-press the title for the handwriting tuner. */}
      <Text style={styles.appName} onLongPress={onOpenTuner} testID="app-title">
        HandWrite
      </Text>
      <Text style={styles.subtitle}>Turn your text into handwritten pages</Text>
      {VALIDATION_RELEASE ? (
        <Text style={styles.validationBadge} accessibilityRole="alert" testID="validation-build-badge">
          Validation build — not for release
        </Text>
      ) : null}
      <Pressable
        onPress={onNewDocument}
        accessibilityRole="button"
        testID="new-document-button"
        style={({ pressed }) => [
          styles.newButton,
          pressed && styles.newButtonPressed,
        ]}
      >
        <PlusIcon color={colors.onCharcoal} />
        <Text style={styles.newButtonText}>New Document</Text>
      </Pressable>
      {onCreateHandwriting ? (
        <Pressable
          onPress={onCreateHandwriting}
          accessibilityRole="button"
          testID="create-handwriting-button"
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.newButtonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Create My Handwriting</Text>
        </Pressable>
      ) : null}
      {onOpenProfiles ? (
        <Pressable
          onPress={onOpenProfiles}
          accessibilityRole="button"
          testID="my-handwritings-button"
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.newButtonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>My Handwritings</Text>
        </Pressable>
      ) : null}
      <Text style={styles.sectionLabel}>Recent Documents</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={documents || []}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <DocumentCard
            document={item}
            onPress={() => onOpenDocument(item.id)}
            onLongPress={() => confirmDelete(item)}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          documents === null ? (
            <ActivityIndicator
              color={colors.textMuted}
              style={styles.loading}
            />
          ) : (
            <EmptyState />
          )
        }
        ItemSeparatorComponent={Separator}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg + 4,
    paddingTop: spacing.xxl,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  appName: {
    ...typography.display,
  },
  validationBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: '#b71c1c',
    color: '#ffffff',
    fontWeight: '700',
    overflow: 'hidden',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    height: 54,
    borderRadius: radii.lg,
    backgroundColor: colors.charcoal,
    ...shadows.card,
  },
  newButtonPressed: {
    opacity: 0.88,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  newButtonText: {
    color: colors.onCharcoal,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionLabel: {
    ...typography.sectionLabel,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.85,
  },
  miniPage: {
    width: 64,
    height: 84,
    borderRadius: 3,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.paperEdge,
    overflow: 'hidden',
  },
  miniRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.paperRule,
  },
  miniText: {
    position: 'absolute',
    top: 2,
    left: 6,
    width: 54,
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    ...typography.title,
    fontSize: 16,
  },
  cardPreview: {
    ...typography.caption,
    marginTop: 2,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: 6,
  },
  inkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meta: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textFaint,
    flexShrink: 1,
  },
  separator: {
    height: spacing.md,
  },
  loading: {
    marginTop: spacing.xxl,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  emptyPage: {
    width: 56,
    height: 72,
    borderRadius: 3,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.paperEdge,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  emptyRule: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: colors.paperRule,
  },
  emptyTitle: {
    ...typography.title,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 19,
  },
});
