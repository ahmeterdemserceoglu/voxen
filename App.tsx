import { useThemeColors, useThemeStyles, type Palette } from './src/utils/useTheme';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useUiStore } from './src/store/uiStore';
import { useAuthStore } from './src/store/authStore';
import { useMusicStore } from './src/store/musicStore';

// Views
import { HomeView } from './src/views/HomeView';
import { SearchView } from './src/views/SearchView';
import { LibraryView } from './src/views/LibraryView';
import { ProfileView } from './src/views/ProfileView';

// Core Player & Navigation Components
import { FloatingNav } from './src/components/FloatingNav';
import { MiniPlayer } from './src/components/MiniPlayer';
import { DesktopSidebar } from './src/components/DesktopSidebar';
import { FullPlayerModal } from './src/components/FullPlayerModal';
import { AudioEngine } from './src/components/AudioEngine';
import { ListeningRoomEngine } from './src/components/ListeningRoomEngine';

// Feature Modals & Sheets
import { AuthModal } from './src/components/AuthModal';
import { SongActionSheet } from './src/components/SongActionSheet';
import { AddToPlaylistModal } from './src/components/AddToPlaylistModal';
import { PlaylistDetailModal } from './src/components/PlaylistDetailModal';
import { SettingsModal } from './src/components/SettingsModal';
import { QueueModal } from './src/components/QueueModal';
import { LyricsModal } from './src/components/LyricsModal';
import { RelatedTracksModal } from './src/components/RelatedTracksModal';
import { PodcastsModal } from './src/components/PodcastsModal';
import { ArtistDetailModal } from './src/components/ArtistDetailModal';
import { AlbumDetailModal } from './src/components/AlbumDetailModal';
import { OnboardingModal } from './src/components/OnboardingModal';
import { EditProfileModal } from './src/components/EditProfileModal';
import { UserProfileModal } from './src/components/UserProfileModal';
import { ListeningRoomModal } from './src/components/ListeningRoomModal';
import { NotificationsModal } from './src/components/NotificationsModal';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { networkStatus } from './src/services/network/networkStatus';
import { widgetService } from './src/services/widget/widgetService';

import { Colors } from './src/constants/theme';

const IS_DESKTOP = Platform.OS === 'web' && process.env.EXPO_PUBLIC_VOXEN_DESKTOP === '1';

export default function App() {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { activeTab } = useUiStore();
  const { initAuthListener, isLoading } = useAuthStore();

  useEffect(() => {
    // Start background network monitoring
    const stopNetworkMonitoring = networkStatus.startMonitoring(online => {
      if (online) void useMusicStore.getState().syncWithCloud();
    });

    // Initialize home screen widget listeners
    const stopWidget = widgetService.init();

    const unsubscribeAuth = initAuthListener();
    return () => {
      unsubscribeAuth();
      stopNetworkMonitoring();
      stopWidget();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const activeView = (
    <>
      {activeTab === 'home' && <HomeView />}
      {activeTab === 'search' && <SearchView />}
      {activeTab === 'library' && <LibraryView />}
      {activeTab === 'profile' && <ProfileView />}
    </>
  );

  const desktopContentWidth = activeTab === 'profile' ? styles.desktopProfileWidth : activeTab === 'search' ? styles.desktopSearchWidth : styles.desktopContentWidth;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <View style={styles.container}>
          <StatusBar style={Colors.text === "#19191F" ? "dark" : "light"} />

          {/* Headless Audio Streaming Engine */}
          <AudioEngine />
          <ListeningRoomEngine />

          {IS_DESKTOP ? (
            <View style={styles.desktopShell}>
              <DesktopSidebar />
              <View style={styles.desktopWorkspace}>
                <View style={styles.desktopBackdropGlow} pointerEvents="none" />
                <View style={styles.desktopScreenContainer}>
                  <View style={[styles.desktopContentFrame, desktopContentWidth]}>{activeView}</View>
                </View>
                <View style={styles.desktopPlayerDock} pointerEvents="box-none">
                  <MiniPlayer />
                </View>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.screenContainer}>{activeView}</View>
              <View style={styles.bottomDockContainer} pointerEvents="box-none">
                <MiniPlayer />
                <FloatingNav />
              </View>
            </>
          )}

          {/* Full Player Modal */}
          <FullPlayerModal />

          {/* Queue Modal */}
          <QueueModal />

          {/* Lyrics Modal */}
          <LyricsModal />

          {/* Related Tracks Modal */}
          <RelatedTracksModal />

          {/* Podcasts Modal */}
          <PodcastsModal />

          {/* Artist Detail Modal */}
          <ArtistDetailModal />

          {/* Album Detail Modal */}
          <AlbumDetailModal />

          {/* Settings Modal */}
          <SettingsModal />

          {/* Onboarding Taste Selection Modal */}
          <OnboardingModal />

          {/* Edit Profile Modal */}
          <EditProfileModal />

          {/* User Profile Modal */}
          <UserProfileModal />

          {/* Listening Room Modal */}
          <ListeningRoomModal />

          {/* In-App Notifications Modal */}
          <NotificationsModal />

          {/* Firebase Authentication Modal */}
          <AuthModal />

          {/* 3-Dots Song Action Sheet */}
          <SongActionSheet />

          {/* Add to Playlist Modal */}
          <AddToPlaylistModal />

          {/* Full Playlist Detail View Modal */}
          <PlaylistDetailModal />
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const createStyles = (Colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenContainer: {
    flex: 1,
  },
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopWorkspace: {
    flex: 1,
    backgroundColor: Colors.background,
    position: 'relative',
    overflow: 'hidden',
  },
  desktopBackdropGlow: {
    position: 'absolute',
    top: -260,
    right: -180,
    width: 680,
    height: 520,
    borderRadius: 340,
    backgroundColor: 'rgba(229,9,20,0.035)',
  },
  desktopScreenContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  desktopContentFrame: {
    width: '100%',
    flex: 1,
  },
  desktopContentWidth: { maxWidth: 1420 },
  desktopSearchWidth: { maxWidth: 1180 },
  desktopProfileWidth: { maxWidth: 960 },
  desktopPlayerDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
  },
  bottomDockContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 90,
  },
});

