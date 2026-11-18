/**
 * In-memory AsyncStorage for Jest (picked up automatically for the
 * node_modules package). Mirrors the v3 API used by documentStorage.
 */
const databases = new Map();

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: async key => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => {
      store.set(key, value);
    },
    removeItem: async key => {
      store.delete(key);
    },
    getAllKeys: async () => Array.from(store.keys()),
    clear: async () => store.clear(),
  };
}

function createAsyncStorage(name) {
  if (!databases.has(name)) {
    databases.set(name, createMemoryStorage());
  }
  return databases.get(name);
}

function clearAllMockStorages() {
  databases.clear();
}

module.exports = {
  __esModule: true,
  createAsyncStorage,
  clearAllMockStorages,
  default: createAsyncStorage('legacy'),
};
