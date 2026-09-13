const DB_NAME = 'learning-quiz';
// v2で選択中の分野などを保存するsettingsストアを追加した。v1の進捗はそのまま引き継ぐ。
export function openDatabase(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'questionId' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('他のタブを閉じて再読み込みしてください。'));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

// 全件の読み取り・更新を単一トランザクションにし、複数タブでも更新を直列化する。
export function updateProgress(db, questions, change) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('progress', 'readwrite');
    const store = tx.objectStore('progress');
    const request = store.getAll();
    let result;
    let failure;
    request.onsuccess = () => {
      try {
        const records = questions.map(q => request.result.find(p => p.questionId === q.id) ?? {
          questionId: q.id, state: 'unseen', lastSeenAt: null,
          seenSinceCount: 0, correctStreak: 0, answerHistory: [],
        });
        result = change(records);
        records.forEach(p => store.put(p));
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('進捗を保存できませんでした。'));
    tx.onerror = () => {};
  });
}

export function readSetting(db, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('settings', 'readonly').objectStore('settings').get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

export function writeSetting(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('設定を保存できませんでした。'));
    tx.onerror = () => {};
  });
}
