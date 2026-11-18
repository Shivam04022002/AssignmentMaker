/**
 * HandWrite — turn typed text into handwritten pages.
 *
 * Navigation is a tiny in-memory stack (Home → New Document → Editor); it
 * avoids pulling in a navigation library for three screens. Each screen
 * handles the Android back button itself.
 *
 * @format
 */
import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreateHandwritingScreen from './src/screens/CreateHandwritingScreen';
import EditorScreen from './src/screens/EditorScreen';
import HandwritingTunerScreen from './src/screens/HandwritingTunerScreen';
import HomeScreen from './src/screens/HomeScreen';
import NewDocumentScreen from './src/screens/NewDocumentScreen';
import ProfileDetailsScreen from './src/screens/ProfileDetailsScreen';
import ProfilesScreen, { deletionNotice } from './src/screens/ProfilesScreen';
import ValidationScreen from './src/screens/ValidationScreen';
import {
  PERSONAL_HANDWRITING_ONBOARDING,
  VALIDATION_TOOLS,
} from './src/dev/flags';
import { colors } from './src/theme/theme';

const HOME = { name: 'home' };

export default function App() {
  const [stack, setStack] = useState([HOME]);
  const route = stack[stack.length - 1];

  const push = useCallback(next => setStack(s => [...s, next]), []);
  const goHome = useCallback(() => setStack([HOME]), []);
  const goBack = useCallback(
    () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s)),
    [],
  );

  // New Document and My Handwritings have no unsaved state, so plain back
  // is safe there.
  useEffect(() => {
    if (route.name !== 'new' && route.name !== 'profiles' && route.name !== 'profile-details') {
      return undefined;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [route.name, goBack]);

  // Developer tools are routes only in development / validation builds: in
  // a release build a stray 'tuner' or 'validation' route shows Home.
  const devOnly = route.name === 'tuner' || route.name === 'validation';
  let screen;
  switch (devOnly && !VALIDATION_TOOLS ? 'home' : route.name) {
    case 'tuner':
      // Internal tool; only reachable in development builds.
      screen = (
        <HandwritingTunerScreen
          onBack={goBack}
          onOpenValidation={() => push({ name: 'validation' })}
        />
      );
      break;
    case 'validation':
      // Internal tool: device validation documents and timings.
      screen = (
        <ValidationScreen
          onBack={goBack}
          onOpenDocument={documentId => push({ name: 'editor', documentId })}
        />
      );
      break;
    case 'create-handwriting':
      // Handles its own back button (it may need to confirm a discard).
      // After saving it shows the result; "Go to Documents" returns Home,
      // "Create Another Handwriting" starts over on the same screen.
      screen = (
        <CreateHandwritingScreen
          onBack={goBack}
          onGoToDocuments={goHome}
        />
      );
      break;
    case 'profiles':
      screen = (
        <ProfilesScreen
          key={route.notice || 'profiles'}
          onBack={goBack}
          onCreate={() => push({ name: 'create-handwriting' })}
          onOpen={profileId => push({ name: 'profile-details', profileId })}
          notice={route.notice}
        />
      );
      break;
    case 'profile-details':
      screen = (
        <ProfileDetailsScreen
          profileId={route.profileId}
          onBack={() =>
            setStack([HOME, { name: 'profiles' }])
          }
          onDeleted={result =>
            setStack([HOME, { name: 'profiles', notice: deletionNotice(result) }])
          }
        />
      );
      break;
    case 'new':
      screen = (
        <NewDocumentScreen
          onBack={goBack}
          onCreate={document =>
            // Replace the form so "back" from the editor returns Home.
            setStack([HOME, { name: 'editor', initialDocument: document }])
          }
        />
      );
      break;
    case 'editor':
      screen = (
        <EditorScreen
          key={route.documentId || route.initialDocument.id}
          documentId={route.documentId}
          initialDocument={route.initialDocument}
          onClose={goHome}
        />
      );
      break;
    default:
      screen = (
        <HomeScreen
          onNewDocument={() => push({ name: 'new' })}
          onOpenDocument={documentId => push({ name: 'editor', documentId })}
          onOpenTuner={
            VALIDATION_TOOLS ? () => push({ name: 'tuner' }) : undefined
          }
          onCreateHandwriting={
            PERSONAL_HANDWRITING_ONBOARDING
              ? () => push({ name: 'create-handwriting' })
              : undefined
          }
          onOpenProfiles={
            PERSONAL_HANDWRITING_ONBOARDING
              ? () => push({ name: 'profiles' })
              : undefined
          }
        />
      );
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />
      <View style={styles.root}>{screen}</View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
