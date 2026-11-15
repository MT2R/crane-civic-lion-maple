const DB = "mt2r-sw-v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const g = tx.objectStore("kv").get(key);
    g.onsuccess = () => resolve(g.result as T | undefined);
    g.onerror = () => reject(g.error);
    tx.oncomplete = () => db.close();
  });
}

export async function idbDrain(key: string): Promise<unknown[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    const g = store.get(key);
    let val: unknown[] = [];
    g.onsuccess = () => {
      val = Array.isArray(g.result) ? g.result : [];
      store.put([], key);
    };
    tx.oncomplete = () => {
      db.close();
      resolve(val);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
