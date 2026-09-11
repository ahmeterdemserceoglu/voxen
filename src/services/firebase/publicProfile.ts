import type { DocumentData } from 'firebase/firestore';

export function publicProfile(uid: string, data: DocumentData): DocumentData {
  const visible = data.profileVisibility === 'public';
  return {
    uid,
    displayName: data.displayName ?? '',
    username: data.username ?? '',
    photoURL: data.photoURL ?? '',
    bio: visible ? data.bio ?? '' : '',
    profileVisibility: visible ? 'public' : 'private',
    showPublicPlaylists: visible && data.showPublicPlaylists !== false,
    playlists: visible && data.showPublicPlaylists !== false && Array.isArray(data.playlists)
      ? data.playlists.filter((playlist: DocumentData) => playlist?.visibility === 'public')
      : [],
  };
}
