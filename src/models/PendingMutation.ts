export type MutationType =
  | 'LIKE'
  | 'UNLIKE'
  | 'PLAYLIST_ADD'
  | 'PLAYLIST_REMOVE'
  | 'PLAYLIST_CREATE'
  | 'PLAYLIST_DELETE'
  | 'PLAYLIST_RENAME'
  | 'FOLLOW_ARTIST'
  | 'UNFOLLOW_ARTIST'
  | 'FOLLOW_USER'
  | 'UNFOLLOW_USER'
  | 'HISTORY_ADD';

export interface PendingMutation {
  id: string;           // uuid v4
  type: MutationType;
  payload: unknown;
  createdAt: number;    // epoch ms
  retryCount: number;
  lastError?: string;
}
