import { doc, getDoc, setDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Track } from '../../models';

export interface ListeningRoom {
  hostUid: string;
  track: Track | null;
  playing: boolean;
  position: number;
  updatedAt?: { toMillis(): number };
}
export const listeningRoomService = {
  async create(uid: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Math.random().toString(36).slice(2, 8).padEnd(6, '0').toUpperCase();
      const created = await runTransaction(db, async tx => {
        const ref = doc(db, 'rooms', code);
        if ((await tx.get(ref)).exists()) return false;
        tx.set(ref, { hostUid: uid, track: null, playing: false, position: 0, updatedAt: serverTimestamp() });
        return true;
      });
      if (created) return code;
    }
    throw new Error('Oda oluşturulamadı. Yeniden deneyin.');
  },
  async join(code: string): Promise<ListeningRoom> {
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('6 haneli oda kodunu kontrol edin.');
    const snap = await getDoc(doc(db, 'rooms', code));
    if (!snap.exists()) throw new Error('Bu oda bulunamadı veya kapatılmış.');
    return snap.data() as ListeningRoom;
  },
  watch(code: string, changed: (room: ListeningRoom | null) => void, failed: (error: Error) => void) {
    return onSnapshot(doc(db, 'rooms', code), snap => changed(snap.exists() ? snap.data() as ListeningRoom : null), failed);
  },
  publish(code: string, state: { currentTrack: Track | null; isPlaying: boolean; position: number }) {
    return setDoc(doc(db, 'rooms', code), {
      track: state.currentTrack ? JSON.parse(JSON.stringify(state.currentTrack)) : null,
      playing: state.isPlaying, position: state.position, updatedAt: serverTimestamp(),
    }, { merge: true });
  },
  close(code: string) { return deleteDoc(doc(db, 'rooms', code)); },
};
