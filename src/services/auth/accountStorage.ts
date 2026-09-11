import AsyncStorage from '@react-native-async-storage/async-storage';

let accountId: string | null = null;
let generation = 0;

export const accountSession = {
  get uid() { return accountId; },
  get generation() { return generation; },
  switchTo(uid: string | null) {
    accountId = uid;
    generation += 1;
    return generation;
  },
  isCurrent(epoch: number) { return generation === epoch; },
};

// Legacy unscoped data has no provable owner; retain it without importing it into an account.
const scopedKey = (key: string) => `${key}:account:${accountId === null ? 'guest' : `user:${accountId}`}`;

export const accountStorage = {
  capture: () => {
    const suffix = `:account:${accountId === null ? 'guest' : `user:${accountId}`}`;
    return {
      getItem: (key: string) => AsyncStorage.getItem(key + suffix),
      setItem: (key: string, value: string) => AsyncStorage.setItem(key + suffix, value),
      removeItem: (key: string) => AsyncStorage.removeItem(key + suffix),
    };
  },
  getItem: (key: string) => AsyncStorage.getItem(scopedKey(key)),
  setItem: (key: string, value: string) => AsyncStorage.setItem(scopedKey(key), value),
  removeItem: (key: string) => AsyncStorage.removeItem(scopedKey(key)),
};
