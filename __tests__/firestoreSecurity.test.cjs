const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, collection, terminate } = require('firebase/firestore');

async function main() {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through firebase emulators:exec, never against production');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const clients = ['alice', 'bob', 'guest'].map(uid => {
    const app = initializeApp({ projectId: 'demo-voxen-security', apiKey: 'demo' }, uid);
    const db = getFirestore(app);
    connectFirestoreEmulator(db, host, Number(port), uid === 'guest' ? {} : { mockUserToken: { sub: uid, user_id: uid } });
    return { app, db };
  });
  const [alice, bob, guest] = clients.map(c => c.db);
  const denied = promise => assert.rejects(promise, error => error.code === 'permission-denied');
  try {
    await setDoc(doc(alice, 'users/alice'), { favorites: ['secret'], playlists: [{ visibility: 'private' }] });
    assert.equal((await getDoc(doc(alice, 'users/alice'))).exists(), true);
    await denied(getDoc(doc(bob, 'users/alice')));
    await denied(getDocs(collection(bob, 'users')));
    await denied(getDoc(doc(guest, 'users/alice')));
    await setDoc(doc(alice, 'publicProfiles/alice'), {
      uid: 'alice', displayName: 'Alice', username: 'alice', photoURL: '', bio: '',
      profileVisibility: 'public', showPublicPlaylists: true, playlists: [],
    });
    assert.equal((await getDoc(doc(bob, 'publicProfiles/alice'))).data().displayName, 'Alice');
    await denied(setDoc(doc(bob, 'publicProfiles/alice'), { uid: 'alice', displayName: 'attacker' }));
    await denied(setDoc(doc(alice, 'publicProfiles/alice'), { uid: 'alice', favorites: ['accidental private copy'] }));
    await denied(setDoc(doc(alice, 'publicProfiles/alice'), { uid: 'alice', email: 'private@example.test' }));
    await setDoc(doc(alice, 'users/alice/likedTracks/song'), { title: 'Private song' });
    await denied(getDoc(doc(bob, 'users/alice/likedTracks/song')));
    await setDoc(doc(alice, 'rooms/ROOM01'), { hostUid:'alice', track:null, playing:false, position:0 });
    assert.equal((await getDoc(doc(bob, 'rooms/ROOM01'))).data().hostUid, 'alice');
    await denied(setDoc(doc(bob, 'rooms/ROOM01'), { playing:true }, { merge:true }));
    await denied(setDoc(doc(alice, 'rooms/ROOM01'), { hostUid:'bob' }, { merge:true }));
    await denied(setDoc(doc(guest, 'rooms/ROOM02'), { hostUid:'guest' }));
    await setDoc(doc(alice, 'rooms/ROOM01'), { playing:true, position:30000 }, { merge:true });
    assert.equal((await getDoc(doc(bob, 'rooms/ROOM01'))).data().position,30000);
    console.log('PASS: owner access, legacy private data isolation, collection-list denial, safe public profile access, forged writes and private-field rejection');
  } finally {
    await Promise.all(clients.map(async ({ app, db }) => { await terminate(db); await deleteApp(app); }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
