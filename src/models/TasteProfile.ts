/** User taste profile built client-side from interaction signals */
export interface TasteProfile {
  genres: Record<string, number>;
  artists: Record<string, number>;
  tracks: Record<string, number>;
  updatedAt: number;
}

/** Interaction scoring weights */
export const TASTE_SCORES = {
  PLAY: 1,
  LISTEN_30S: 2,
  COMPLETE: 3,
  REPEAT: 4,
  LIKE: 5,
  PLAYLIST_ADD: 6,
  ARTIST_FOLLOW: 8,
  SKIP: -2,
} as const;

export type TasteInteraction = keyof typeof TASTE_SCORES;

export function createEmptyTasteProfile(): TasteProfile {
  return { genres: {}, artists: {}, tracks: {}, updatedAt: Date.now() };
}

export function applyInteraction(
  profile: TasteProfile,
  interaction: TasteInteraction,
  artistName?: string,
  genre?: string,
  trackId?: string,
): TasteProfile {
  const score = TASTE_SCORES[interaction];
  const updated = {
    ...profile,
    genres: { ...profile.genres },
    artists: { ...profile.artists },
    tracks: { ...profile.tracks },
    updatedAt: Date.now(),
  };

  if (artistName) {
    updated.artists[artistName] = (updated.artists[artistName] || 0) + score;
  }
  if (genre) {
    updated.genres[genre] = (updated.genres[genre] || 0) + score;
  }
  if (trackId) {
    updated.tracks[trackId] = (updated.tracks[trackId] || 0) + score;
  }

  return updated;
}

/** Return top N keys by score */
export function topKeys(map: Record<string, number>, n = 5): string[] {
  return Object.entries(map)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}
