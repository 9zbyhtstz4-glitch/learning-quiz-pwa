const DB_NAME = 'learning-quiz';
export function openDatabase(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('progress', { keyPath: 'questionId' });
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
