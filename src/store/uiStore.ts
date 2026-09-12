import { create } from 'zustand';
import type { PodcastChannel } from '../services/youtubeService';

export type TabKey = 'home' | 'search' | 'library' | 'profile';

export type ActiveModal =
  | 'settings'
  | 'queue'
  | 'lyrics'
  | 'related'
  | 'podcasts'
  | 'artist'
  | 'album'
  | 'notifications'
  | 'listeningRoom'
  | 'onboarding'
  | 'editProfile'
  | 'userProfile'
  | null;

interface UiState {
  activeTab: TabKey;
  activeModal: ActiveModal;
  activeArtistQuery: string | null;
  activeAlbumQuery: string | null;
  activeAlbumId: string | null;
  activeUserUid: string | null;
  activePodcastData: PodcastChannel | null;

  setActiveTab: (tab: TabKey) => void;
  openModal: (modal: ActiveModal, payload?: string) => void;
  closeModal: () => void;
  openArtist: (artistName: string) => void;
  openAlbum: (albumTitle: string, browseId?: string) => void;
  openUserProfile: (uid: string) => void;
  openPodcast: (podcast: PodcastChannel) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'home',
  activeModal: null,
  activeArtistQuery: null,
  activeAlbumQuery: null,
  activeAlbumId: null,
  activeUserUid: null,
  activePodcastData: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  openModal: (activeModal, payload) => set({ activeModal, activeArtistQuery: payload || null }),
  closeModal: () => set({ activeModal: null, activeArtistQuery: null, activeAlbumQuery: null, activeUserUid: null, activePodcastData: null }),
  openArtist: (artistName) => set({ activeModal: 'artist', activeArtistQuery: artistName }),
  openAlbum: (albumTitle, browseId) => set({ activeModal: 'album', activeAlbumQuery: albumTitle, activeAlbumId: browseId || null }),
  openUserProfile: (uid) => set({ activeModal: 'userProfile', activeUserUid: uid }),
  openPodcast: (podcast) => set({ activeModal: 'podcasts', activePodcastData: podcast }),
}));
