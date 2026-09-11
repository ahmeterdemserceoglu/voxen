/**
 * Centralized Firestore collection/document path constants.
 */
export const FIRESTORE_COLLECTIONS = {
  USERS: 'users',
  USERNAMES: 'usernames',
  PLAYLISTS: 'playlists',
  ROOMS: 'rooms',
} as const;

export const FIRESTORE_SUBCOLLECTIONS = {
  LIKED_TRACKS: 'likedTracks',
  FOLLOWED_ARTISTS: 'followedArtists',
  FOLLOWING_USERS: 'followingUsers',
  FOLLOWERS: 'followers',
  HISTORY: 'history',
  SETTINGS: 'settings',
  DEVICES: 'devices',
  NOTIFICATIONS: 'notifications',
  GENERATED_MIXES: 'generatedMixes',
  ACTIVITY: 'activity',
  PLAYLIST_TRACKS: 'tracks',
  PLAYLIST_MEMBERS: 'members',
} as const;

/** Build a Firestore path string safely */
export const firestorePath = {
  user: (uid: string) => `${FIRESTORE_COLLECTIONS.USERS}/${uid}`,
  username: (normalized: string) => `${FIRESTORE_COLLECTIONS.USERNAMES}/${normalized}`,
  likedTrack: (uid: string, trackId: string) =>
    `${FIRESTORE_COLLECTIONS.USERS}/${uid}/${FIRESTORE_SUBCOLLECTIONS.LIKED_TRACKS}/${trackId}`,
  followedArtist: (uid: string, artistId: string) =>
    `${FIRESTORE_COLLECTIONS.USERS}/${uid}/${FIRESTORE_SUBCOLLECTIONS.FOLLOWED_ARTISTS}/${artistId}`,
  followingUser: (uid: string, targetUid: string) =>
    `${FIRESTORE_COLLECTIONS.USERS}/${uid}/${FIRESTORE_SUBCOLLECTIONS.FOLLOWING_USERS}/${targetUid}`,
  follower: (uid: string, followerUid: string) =>
    `${FIRESTORE_COLLECTIONS.USERS}/${uid}/${FIRESTORE_SUBCOLLECTIONS.FOLLOWERS}/${followerUid}`,
  historyEntry: (uid: string, entryId: string) =>
    `${FIRESTORE_COLLECTIONS.USERS}/${uid}/${FIRESTORE_SUBCOLLECTIONS.HISTORY}/${entryId}`,
  notification: (uid: string, notifId: string) =>
    `${FIRESTORE_COLLECTIONS.USERS}/${uid}/${FIRESTORE_SUBCOLLECTIONS.NOTIFICATIONS}/${notifId}`,
  generatedMix: (uid: string, date: string) =>
    `${FIRESTORE_COLLECTIONS.USERS}/${uid}/${FIRESTORE_SUBCOLLECTIONS.GENERATED_MIXES}/${date}`,
  playlist: (playlistId: string) => `${FIRESTORE_COLLECTIONS.PLAYLISTS}/${playlistId}`,
  playlistTrack: (playlistId: string, trackEntryId: string) =>
    `${FIRESTORE_COLLECTIONS.PLAYLISTS}/${playlistId}/${FIRESTORE_SUBCOLLECTIONS.PLAYLIST_TRACKS}/${trackEntryId}`,
  playlistMember: (playlistId: string, uid: string) =>
    `${FIRESTORE_COLLECTIONS.PLAYLISTS}/${playlistId}/${FIRESTORE_SUBCOLLECTIONS.PLAYLIST_MEMBERS}/${uid}`,
  room: (roomId: string) => `${FIRESTORE_COLLECTIONS.ROOMS}/${roomId}`,
};
