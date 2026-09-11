import { create } from 'zustand';
import type { AppNotification, UserSummary, SerializedArtist } from '../models';

export interface PresenceData {
  online: boolean;
  lastSeen: number;
  currentTrack?: {
    id: string;
    title: string;
    artist: string;
  };
}

export interface ActivityItem {
  id: string;
  userId: string;
  userDisplayName: string;
  type: 'now_playing' | 'playlist_created' | 'liked_song';
  data: Record<string, string>;
  createdAt: number;
}

interface SocialState {
  followingUsers: UserSummary[];
  followers: UserSummary[];
  followingArtists: SerializedArtist[];
  notifications: AppNotification[];
  unreadCount: number;
  activity: ActivityItem[];
  presenceMap: Record<string, PresenceData>;
  activeRoom: string | null;
  roomHostUid: string | null;
  roomError: string | null;
  setActiveRoom: (room: string | null) => void;
  isLoading: boolean;

  setFollowingUsers: (users: UserSummary[]) => void;
  setFollowers: (users: UserSummary[]) => void;
  addNotification: (n: AppNotification) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  setActivity: (items: ActivityItem[]) => void;
  updatePresence: (uid: string, presence: PresenceData) => void;
  setFollowingArtists: (artists: SerializedArtist[]) => void;
  followUser: (user: UserSummary) => void;
  unfollowUser: (uid: string) => void;
  isFollowingUser: (uid: string) => boolean;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  followingUsers: [],
  followers: [],
  followingArtists: [],
  notifications: [],
  unreadCount: 0,
  activity: [],
  presenceMap: {},
  activeRoom: null,
  roomHostUid: null,
  roomError: null,
  setActiveRoom: (room) => set({ activeRoom: room }),
  isLoading: false,

  setFollowingUsers: (users) => set({ followingUsers: users }),
  setFollowers: (users) => set({ followers: users }),

  setFollowingArtists: (artists) => set({ followingArtists: artists }),

  addNotification: (n) => {
    const updated = [n, ...get().notifications].slice(0, 100);
    const unread = updated.filter((x) => !x.read).length;
    set({ notifications: updated, unreadCount: unread });
  },

  markAllRead: () => {
    const updated = get().notifications.map((n) => ({ ...n, read: true }));
    set({ notifications: updated, unreadCount: 0 });
  },

  markRead: (id) => {
    const updated = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n,
    );
    const unread = updated.filter((x) => !x.read).length;
    set({ notifications: updated, unreadCount: unread });
  },

  setActivity: (items) => set({ activity: items }),

  updatePresence: (uid, presence) => {
    set({ presenceMap: { ...get().presenceMap, [uid]: presence } });
  },

  followUser: (user) => {
    const current = get().followingUsers;
    if (current.some((u) => u.uid === user.uid)) return;
    set({ followingUsers: [...current, user] });
  },

  unfollowUser: (uid) => {
    set({ followingUsers: get().followingUsers.filter((u) => u.uid !== uid) });
  },

  isFollowingUser: (uid) => {
    return get().followingUsers.some((u) => u.uid === uid);
  },
}));
