import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import { publicProfile } from './publicProfile';
import { mergeLibrary } from '../sync/mergeLibrary';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '../../constants/firestoreCollections';
import { logger } from '../../utils/logger';
import type { UserProfile } from '../../models';

const TAG = 'FirestoreService';

export class FirebaseError extends Error {
  constructor(message: string, public original?: unknown) {
    super(message);
    this.name = 'FirebaseError';
  }
}

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    logger.warn(TAG, err);
    return fallback;
  }
};

export const firestoreService = {
  // User

  getUser: async (uid: string): Promise<UserProfile | null> => {
    return safe(async () => {
      const collectionName = auth.currentUser?.uid === uid ? FIRESTORE_COLLECTIONS.USERS : 'publicProfiles';
      const snap = await getDoc(doc(db, collectionName, uid));
      return snap.exists() ? (snap.data() as UserProfile) : null;
    }, null);
  },

  createUser: async (profile: Omit<UserProfile, 'createdAt' | 'updatedAt'>): Promise<void> => {
    await firestoreService.updateUser(profile.uid, {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  updateUser: async (uid: string, data: DocumentData): Promise<void> => {
    const ref = doc(db, FIRESTORE_COLLECTIONS.USERS, uid);
    await runTransaction(db, async (tx) => {
      const snapshot = await tx.get(ref);
      const previous = snapshot.data() || {};
      const changes = data.syncMeta ? { ...data, ...mergeLibrary(
        { favorites: data.favorites || [], playlists: data.playlists || [], syncMeta: data.syncMeta },
        { favorites: previous.favorites || [], playlists: previous.playlists || [], syncMeta: previous.syncMeta },
      ) } : data;
      const merged = { ...previous, ...changes };
      tx.set(ref, { ...changes, updatedAt: serverTimestamp() }, { merge: true });
      tx.set(doc(db, 'publicProfiles', uid), publicProfile(uid, merged));
    });
  },

  deleteUser: async (uid: string): Promise<void> => {
    const ref = doc(db, FIRESTORE_COLLECTIONS.USERS, uid);
    const batch = writeBatch(db);
    batch.delete(ref);
    batch.delete(doc(db, 'publicProfiles', uid));
    await batch.commit();
  },

  // Username reservation

  reserveUsername: async (username: string, uid: string): Promise<boolean> => {
    const normalized = username.toLowerCase().trim();
    const ref = doc(db, FIRESTORE_COLLECTIONS.USERNAMES, normalized);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists() && snap.data()?.uid !== uid) {
          throw new Error('Username taken');
        }
        tx.set(ref, { uid, reservedAt: serverTimestamp() });
      });
      return true;
    } catch {
      return false;
    }
  },

  isUsernameTaken: async (username: string): Promise<boolean> => {
    const normalized = username.toLowerCase().trim();
    const snap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.USERNAMES, normalized));
    return snap.exists();
  },

  releaseUsername: async (username: string): Promise<void> => {
    const normalized = username.toLowerCase().trim();
    await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.USERNAMES, normalized));
  },

  updateUserUsername: async (newUsername: string, uid: string, oldUsername?: string): Promise<boolean> => {
    const normalizedNew = newUsername.toLowerCase().trim();
    const newRef = doc(db, FIRESTORE_COLLECTIONS.USERNAMES, normalizedNew);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(newRef);
        if (snap.exists() && snap.data()?.uid !== uid) {
          throw new Error('Username taken');
        }
        tx.set(newRef, { uid, reservedAt: serverTimestamp() });
      });
    } catch {
      return false;
    }

    // Explicitly release previous known username if distinct
    if (oldUsername) {
      const normalizedOld = oldUsername.toLowerCase().trim();
      if (normalizedOld && normalizedOld !== normalizedNew) {
        try {
          await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.USERNAMES, normalizedOld));
        } catch (e) {
          logger.warn(TAG, 'Failed to release old username doc', e);
        }
      }
    }

    // Query and clean up any other username documents that point to this same uid
    try {
      const q = query(
        collection(db, FIRESTORE_COLLECTIONS.USERNAMES),
        where('uid', '==', uid)
      );
      const snap = await getDocs(q);
      const deletePromises: Promise<void>[] = [];
      snap.forEach((d) => {
        if (d.id !== normalizedNew) {
          deletePromises.push(deleteDoc(d.ref));
        }
      });
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
    } catch (err) {
      logger.warn(TAG, 'Orphan username cleanup error', err);
    }

    return true;
  },

  cleanOrphanUsernames: async (currentUsername: string, uid: string): Promise<void> => {
    const normalizedCurrent = currentUsername.toLowerCase().trim();
    try {
      const q = query(
        collection(db, FIRESTORE_COLLECTIONS.USERNAMES),
        where('uid', '==', uid)
      );
      const snap = await getDocs(q);
      const deletePromises: Promise<void>[] = [];
      snap.forEach((d) => {
        if (d.id !== normalizedCurrent) {
          deletePromises.push(deleteDoc(d.ref));
        }
      });
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
    } catch (err) {
      logger.warn(TAG, 'cleanOrphanUsernames notice', err);
    }
  },

  // Subcollection helpers

  getSubcollectionDocs: async (
    uid: string,
    subcollection: string,
    constraints: QueryConstraint[] = [],
  ): Promise<DocumentData[]> => {
    return safe(async () => {
      const ref = collection(db, FIRESTORE_COLLECTIONS.USERS, uid, subcollection);
      const q = query(ref, ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data());
    }, []);
  },

  setSubcollectionDoc: async (
    uid: string,
    subcollection: string,
    docId: string,
    data: DocumentData,
  ): Promise<void> => {
    const ref = doc(db, FIRESTORE_COLLECTIONS.USERS, uid, subcollection, docId);
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  },

  deleteSubcollectionDoc: async (
    uid: string,
    subcollection: string,
    docId: string,
  ): Promise<void> => {
    const ref = doc(db, FIRESTORE_COLLECTIONS.USERS, uid, subcollection, docId);
    await deleteDoc(ref);
  },

  // Batch write helper

  batchWrite: async (
    operations: Array<{
      type: 'set' | 'update' | 'delete';
      path: string;
      data?: DocumentData;
    }>,
  ): Promise<void> => {
    const batch = writeBatch(db);
    for (const op of operations) {
      const ref = doc(db, op.path);
      if (op.type === 'set' && op.data) batch.set(ref, op.data, { merge: true });
      else if (op.type === 'update' && op.data) batch.update(ref, op.data);
      else if (op.type === 'delete') batch.delete(ref);
    }
    await batch.commit();
  },
};
