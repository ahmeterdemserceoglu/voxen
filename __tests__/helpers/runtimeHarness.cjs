const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const pause = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function harness(overrides = {}) {
  const disk = new Map();
  const cloud = new Map();
  const modules = new Map();
  const auth = { currentUser: null };
  let listener;
  const hooks = {};
  const storage = {
    getItem: async key => { const value = disk.get(key) ?? null; await hooks.read?.(key); return value; },
    setItem: async (key, value) => { await hooks.write?.(key); disk.set(key, value); },
    removeItem: async key => disk.delete(key),
  };
  const snapshot = ref => ({ exists: () => cloud.has(ref), data: () => cloud.get(ref) });
  const firestore = {
    doc: (_, ...parts) => parts.join('/'),
    getDoc: async ref => { const result = snapshot(ref); await hooks.cloudRead?.(ref); return result; },
    serverTimestamp: () => 1,
    runTransaction: async (_, fn) => {
      const writes = [];
      await fn({ get: async ref => snapshot(ref), set: (ref, data, options) => writes.push([ref, data, options]) });
      for (const [ref, data, options] of writes) cloud.set(ref, options?.merge ? { ...cloud.get(ref), ...data } : data);
    },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const localRequire = id => {
      if (id in overrides) return overrides[id];
      if (id === '@react-native-async-storage/async-storage') return storage;
      if (id === 'firebase/firestore') return firestore;
      if (id === 'firebase/auth') return {
        onAuthStateChanged: (_, callback) => { listener = callback; return () => {}; },
        signOut: async () => { auth.currentUser = null; await listener(null); },
      };
      if (id.endsWith('/config/firebase')) return { auth, db: {} };
      if (id.endsWith('/utils/logger')) return { logger: { warn() {}, debug() {}, info() {} } };
      if (id.startsWith('.')) {
        const target = path.resolve(path.dirname(filename), id);
        return load(fs.existsSync(target + '.ts') ? target + '.ts' : fs.existsSync(target + '.tsx') ? target + '.tsx' : fs.existsSync(target + '/index.ts') ? target + '/index.ts' : target);
      }
      return require(id);
    };
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React },
    }).outputText;
    new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
    return module.exports;
  }
  const music = load('src/store/musicStore.ts').useMusicStore;
  const authStore = load('src/store/authStore.ts').useAuthStore;
  authStore.getState().initAuthListener();
  const change = uid => { auth.currentUser = uid ? { uid } : null; return listener(auth.currentUser); };
  return { disk, cloud, hooks, music, authStore, change, load };
}


module.exports = { harness, pause };
