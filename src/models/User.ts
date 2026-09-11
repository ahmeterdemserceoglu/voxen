import { Timestamp } from 'firebase/firestore';

export type ProfileVisibility = 'public' | 'private';

/** Firestore users/{uid} document */
export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  country: string;
  language: string;
  explicitContent: boolean;
  profileVisibility: ProfileVisibility;
  showListeningActivity: boolean;
  showPublicPlaylists: boolean;
  onboardingCompleted: boolean;
  preferredGenres: string[];
  followedArtistIds: string[];
  createdAt: Timestamp | number;
  updatedAt: Timestamp | number;
}

/** Minimal user reference stored in social structures */
export type UserSummary = Pick<UserProfile, 'uid' | 'displayName' | 'username' | 'photoURL'>;
