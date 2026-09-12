/**
 * Centralized AsyncStorage key constants.
 * Never use raw string keys directly � always use these.
 */
export const STORAGE_KEYS = {
  // Music state
  LIBRARY_SYNC_META: '@voxen_library_sync_meta',
  FAVORITES: '@voxen_favorites',
  HISTORY: '@voxen_history',
  PLAYLISTS: '@voxen_playlists',
  QUEUE_SNAPSHOT: '@voxen_queue_snapshot',
  PLAYBACK_SESSION: '@voxen_playback_session',
  RECENTLY_PLAYED: '@voxen_recently_played',

  // Library
  SAVED_ALBUMS: '@voxen_saved_albums',
  RECOMMENDATION_FEEDBACK: '@voxen_recommendation_feedback',
  FOLLOWED_ARTISTS: '@voxen_followed_artists',
  FOLLOWING_USERS: '@voxen_following_users',
  RECENT_SEARCHES: '@voxen_recent_searches',

  // Settings
  SETTINGS: '@voxen_settings',
  ONBOARDING_COMPLETED: '@voxen_onboarding_completed',
  TASTE_PROFILE: '@voxen_taste_profile',

  // Cache
  SEARCH_CACHE: '@voxen_search_cache',
  TRACK_METADATA_CACHE: '@voxen_track_cache',
  ARTIST_METADATA_CACHE: '@voxen_artist_cache',
  ALBUM_METADATA_CACHE: '@voxen_album_cache',
  LYRICS_CACHE: '@voxen_lyrics_cache',
  DAILY_MIX_CACHE: '@voxen_daily_mix_cache',

  // Offline downloads & cache
  DOWNLOADED_TRACKS: '@voxen_downloaded_tracks',
  AUDIO_CACHE: '@voxen_audio_cache',

  // Offline mutation queue
  PENDING_MUTATIONS: '@voxen_pending_mutations',

  // Schema versioning
  SCHEMA_VERSION: '@voxen_schema_version',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
