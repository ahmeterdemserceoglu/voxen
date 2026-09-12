export type NotificationType =
  | 'NEW_FOLLOWER'
  | 'PLAYLIST_INVITE'
  | 'LISTENING_ROOM_INVITE'
  | 'FOLLOW_REQUEST';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  read: boolean;
  createdAt: number;
}
