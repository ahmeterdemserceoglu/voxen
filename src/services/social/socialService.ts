import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '../../constants/firestoreCollections';
import { firestoreService } from '../firebase/firestoreService';
import { logger } from '../../utils/logger';
import type { SerializedArtist, UserSummary } from '../../models';

const TAG = 'SocialService';

export const socialService = {
  /** Follow a user - writes to both sides atomically */
  followUser: async (myUid: string, targetUid: string): Promise<void> => {
    const batch = writeBatch(db);
    const followingRef = doc(
      db,
      FIRESTORE_COLLECTIONS.USERS,
      myUid,
      FIRESTORE_SUBCOLLECTIONS.FOLLOWING_USERS,
      targetUid,
    );
    const followerRef = doc(
      db,
      FIRESTORE_COLLECTIONS.USERS,
      targetUid,
      FIRESTORE_SUBCOLLECTIONS.FOLLOWERS,
      myUid,
    );
    batch.set(followingRef, { uid: targetUid, followedAt: serverTimestamp() });
    batch.set(followerRef, { uid: myUid, followedAt: serverTimestamp() });
    await batch.commit();
  },

  /** Unfollow a user - removes from both sides */
  unfollowUser: async (myUid: string, targetUid: string): Promise<void> => {
    const batch = writeBatch(db);
    const followingRef = doc(
      db,
      FIRESTORE_COLLECTIONS.USERS,
      myUid,
      FIRESTORE_SUBCOLLECTIONS.FOLLOWING_USERS,
      targetUid,
    );
    const followerRef = doc(
      db,
      FIRESTORE_COLLECTIONS.USERS,
      targetUid,
      FIRESTORE_SUBCOLLECTIONS.FOLLOWERS,
      myUid,
    );
    batch.delete(followingRef);
    batch.delete(followerRef);
    await batch.commit();
  },

  /** Follow an artist */
  followArtist: async (uid: string, artist: SerializedArtist): Promise<void> => {
    await firestoreService.setSubcollectionDoc(
      uid,
      FIRESTORE_SUBCOLLECTIONS.FOLLOWED_ARTISTS,
      artist.id,
      { artist, followedAt: Date.now() },
    );
  },

  /** Unfollow an artist */
  unfollowArtist: async (uid: string, artistId: string): Promise<void> => {
    await firestoreService.deleteSubcollectionDoc(
      uid,
      FIRESTORE_SUBCOLLECTIONS.FOLLOWED_ARTISTS,
      artistId,
    );
  },

  /** Get followers of a user */
  getFollowers: async (uid: string): Promise<UserSummary[]> => {
    const docs = await firestoreService.getSubcollectionDocs(
      uid,
      FIRESTORE_SUBCOLLECTIONS.FOLLOWERS,
    );
    return Promise.all(docs.map(async d => {
      const profile = await firestoreService.getUser(d.uid);
      return { uid: d.uid, displayName: profile?.displayName || '', username: profile?.username || '', photoURL: profile?.photoURL };
    }));
  },

  /** Get users that uid is following */
  getFollowing: async (uid: string): Promise<UserSummary[]> => {
    const docs = await firestoreService.getSubcollectionDocs(
      uid,
      FIRESTORE_SUBCOLLECTIONS.FOLLOWING_USERS,
    );
    return Promise.all(docs.map(async d => {
      const profile = await firestoreService.getUser(d.uid);
      return { uid: d.uid, displayName: profile?.displayName || '', username: profile?.username || '', photoURL: profile?.photoURL };
    }));
  },

  /** Write an in-app notification to target user */
  sendNotification: async (
    targetUid: string,
    notification: {
      id: string;
      type: string;
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<void> => {
    try {
      const ref = doc(
        db,
        FIRESTORE_COLLECTIONS.USERS,
        targetUid,
        FIRESTORE_SUBCOLLECTIONS.NOTIFICATIONS,
        notification.id,
      );
      await setDoc(ref, { ...notification, read: false, createdAt: serverTimestamp() });
    } catch (err) {
      logger.warn(TAG, 'sendNotification error', err);
    }
  },
};
