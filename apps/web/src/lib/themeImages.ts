const DB_NAME = "encore-flow-theme";
const STORE = "images";
const DB_VERSION = 1;

type ThemeImages = {
  messagesBgImage: string;
  loginBgImage: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("无法打开主题存储"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function loadThemeImages(): Promise<ThemeImages> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return { messagesBgImage: "", loginBgImage: "" };
  }
  try {
    const db = await openDb();
    return await new Promise<ThemeImages>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const messagesReq = store.get("messagesBgImage");
      const loginReq = store.get("loginBgImage");
      let messagesBgImage = "";
      let loginBgImage = "";
      let pending = 2;
      const done = () => {
        pending -= 1;
        if (pending === 0) resolve({ messagesBgImage, loginBgImage });
      };
      messagesReq.onsuccess = () => {
        messagesBgImage = typeof messagesReq.result === "string" ? messagesReq.result : "";
        done();
      };
      messagesReq.onerror = () => reject(messagesReq.error);
      loginReq.onsuccess = () => {
        loginBgImage = typeof loginReq.result === "string" ? loginReq.result : "";
        done();
      };
      loginReq.onerror = () => reject(loginReq.error);
    });
  } catch {
    return { messagesBgImage: "", loginBgImage: "" };
  }
}

export async function saveThemeImages(images: ThemeImages): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(images.messagesBgImage, "messagesBgImage");
    store.put(images.loginBgImage, "loginBgImage");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearThemeImages(): Promise<void> {
  await saveThemeImages({ messagesBgImage: "", loginBgImage: "" });
}
