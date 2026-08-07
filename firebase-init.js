// firebase-init.js
// Inicialização do Firebase + helpers. O Firestore é a FONTE DA VERDADE.
// Regras de consistência (anti race condition):
//  - Criação de agendamento usa lock por slot (slotLocks) em transação.
//  - Atualização valida o slot de destino na transação e libera o lock ao cancelar.
//  - Exclusão remove schedule + lock de forma atômica.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  getDocs
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// Firebase configuration provided by user
const firebaseConfig = {
  apiKey: "AIzaSyBLOKoowIHJlifhrJEIOy5hv72UDhc4lf8",
  authDomain: "paletes-3356a.firebaseapp.com",
  projectId: "paletes-3356a",
  storageBucket: "paletes-3356a.firebasestorage.app",
  messagingSenderId: "570187509049",
  appId: "1:570187509049:web:3b1c3164e1961b739e8ce8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ----- Auth -----
let signedIn = false;
let resolveReady;
const ready = new Promise((resolve) => { resolveReady = resolve; });

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.__fbUser = user;
    if (!signedIn) {
      signedIn = true;
      resolveReady(user);
    }
    console.info('Firebase auth state changed. Signed in as:', user.uid, 'isAnonymous:', user.isAnonymous);
  } else {
    signInAnonymously(auth).then((cred) => {
      console.info('Signed in anonymously:', cred.user.uid);
    }).catch((err) => {
      console.warn('Anonymous sign-in failed:', err);
    });
  }
});

// ----- Helpers internos -----
function lockIdFor(payload) {
  return `${payload.cd}_${payload.date}_${payload.time}`.replace(/\s+/g, '_');
}

function isoOf(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v.toMillis === 'function') return new Date(v.toMillis()).toISOString();
  return String(v);
}

// Converte Timestamps/objetos do Firestore em valores serializáveis (ISO strings).
function exportable(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') {
      if (typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
      else if (typeof v.toMillis === 'function') out[k] = new Date(v.toMillis()).toISOString();
      else if ('seconds' in v && 'nanoseconds' in v) out[k] = new Date(v.seconds * 1000).toISOString();
      else if (Array.isArray(v)) out[k] = v.map((x) => (x && typeof x === 'object' ? exportable(x) : x));
      else out[k] = exportable(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ----- API exposta (window.FB) -----
window.FB = {
  app,
  auth,
  db,
  ready,
  whenReady: () => ready,

  // ============================================================
  // SCHEDULES
  // ============================================================

  // Listener com range opcional {from, to} (YYYY-MM-DD). Sem range, escuta tudo.
  listenSchedulesByCD: function (cd, onChange, opts) {
    try {
      const col = collection(db, 'schedules');
      const q = (opts && opts.from && opts.to)
        ? query(col, where('cd', '==', cd), where('date', '>=', opts.from), where('date', '<=', opts.to), orderBy('date', 'asc'))
        : query(col, where('cd', '==', cd));
      return onSnapshot(q, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onChange(docs, snap);
      }, (err) => {
        console.error('listenSchedulesByCD error', err);
      });
    } catch (e) {
      console.error('listenSchedulesByCD failed', e);
      return function () {};
    }
  },

  getAllSchedulesByCD: async function (cd) {
    const q = query(collection(db, 'schedules'), where('cd', '==', cd));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // Cria agendamento de forma atômica usando lock por slot (evita reserva dupla).
  // Se historyEvent for informado, o registro vai na MESMA transação (atomicidade).
  createScheduleAtomic: async function (payload, historyEvent) {
    const lockRef = doc(db, 'slotLocks', lockIdFor(payload));
    const schedulesCol = collection(db, 'schedules');

    return runTransaction(db, async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists()) {
        throw new Error('Slot already reserved');
      }
      const newDocRef = doc(schedulesCol);
      tx.set(newDocRef, { ...payload, createdAt: serverTimestamp() });
      tx.set(lockRef, {
        scheduleId: newDocRef.id,
        cd: payload.cd,
        date: payload.date,
        time: payload.time,
        status: 'active',
        createdAt: serverTimestamp()
      });
      if (historyEvent) {
        tx.set(doc(collection(db, 'history')), {
          ...historyEvent,
          cd: payload.cd,
          createdAt: serverTimestamp()
        });
      }
      return newDocRef.id;
    });
  },

  // Update transacional: valida o slot de destino e gerencia locks.
  // - Se o agendamento é CANCELADO, o lock do slot é removido (horário liberado).
  // - Se o horário muda, o novo slot é validado e o lock é migrado.
  updateSchedule: async function (id, patch, historyEvent) {
    const ref = doc(db, 'schedules', id);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Agendamento não encontrado.');

      const prev = snap.data();
      const prevLockId = lockIdFor(prev);
      const nextLockId = lockIdFor({ ...prev, ...patch });
      const wasActive = prev.status !== 'Cancelado';
      const slotChanged = prevLockId !== nextLockId;
      const becomingCancelled = patch.status === 'Cancelado' && wasActive;

      if (slotChanged && wasActive && !becomingCancelled) {
        const newLockRef = doc(db, 'slotLocks', nextLockId);
        const newLock = await tx.get(newLockRef);
        if (newLock.exists()) {
          const owner = newLock.data();
          if (owner.scheduleId !== id) throw new Error('Slot already reserved');
        }
      }

      tx.update(ref, { ...patch, updatedAt: serverTimestamp() });

      if (becomingCancelled) {
        tx.delete(doc(db, 'slotLocks', prevLockId));
      } else if (slotChanged && wasActive) {
        tx.delete(doc(db, 'slotLocks', prevLockId));
        tx.set(doc(db, 'slotLocks', nextLockId), {
          scheduleId: id,
          cd: patch.cd || prev.cd,
          date: patch.date || prev.date,
          time: patch.time || prev.time,
          status: 'active',
          createdAt: serverTimestamp()
        });
      }

      if (historyEvent) {
        tx.set(doc(collection(db, 'history')), {
          ...historyEvent,
          cd: patch.cd || prev.cd,
          createdAt: serverTimestamp()
        });
      }
      return true;
    });
  },

  // Exclui agendamento e libera o lock de forma atômica.
  deleteSchedule: async function (id, schedule) {
    const ref = doc(db, 'schedules', id);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? snap.data() : (schedule || {});
      tx.delete(ref);
      if (data.cd && data.date && data.time) {
        tx.delete(doc(db, 'slotLocks', lockIdFor(data)));
      }
      return true;
    });
  },

  // Libera um lock manualmente (uso de emergência).
  releaseSlotLock: async function (payload) {
    return deleteDoc(doc(db, 'slotLocks', lockIdFor(payload)));
  },

  // ============================================================
  // HISTORY
  // ============================================================

  listenHistoryByCD: function (cd, onChange) {
    try {
      const q = query(collection(db, 'history'), where('cd', '==', cd));
      return onSnapshot(q, (snap) => {
        const docs = snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, timestamp: isoOf(data.createdAt) || data.timestamp };
        });
        docs.sort((a, b) => (new Date(b.timestamp || 0).getTime()) - (new Date(a.timestamp || 0).getTime()));
        onChange(docs, snap);
      }, (err) => {
        console.error('listenHistoryByCD error', err);
      });
    } catch (e) {
      console.error('listenHistoryByCD failed', e);
      return function () {};
    }
  },

  addHistoryEvent: async function (event) {
    return addDoc(collection(db, 'history'), { ...event, createdAt: serverTimestamp() });
  },

  clearHistoryByCD: async function (cd) {
    const q = query(collection(db, 'history'), where('cd', '==', cd));
    const snap = await getDocs(q);
    let batch = writeBatch(db);
    let count = 0;
    let total = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      count++;
      total++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count) await batch.commit();
    return total;
  },

  // ============================================================
  // SUPPLIERS (globais)
  // ============================================================

  listenSuppliers: function (onChange) {
    try {
      return onSnapshot(collection(db, 'suppliers'), (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onChange(docs, snap);
      }, (err) => {
        console.error('listenSuppliers error', err);
      });
    } catch (e) {
      console.error('listenSuppliers failed', e);
      return function () {};
    }
  },

  createSupplier: async function (payload) {
    const ref = await addDoc(collection(db, 'suppliers'), { ...payload, createdAt: serverTimestamp() });
    return ref.id;
  },

  updateSupplier: async function (id, patch) {
    return updateDoc(doc(db, 'suppliers', id), { ...patch, updatedAt: serverTimestamp() });
  },

  deleteSupplier: async function (id) {
    return deleteDoc(doc(db, 'suppliers', id));
  },

  scheduleCountBySupplier: async function (name) {
    const q = query(collection(db, 'schedules'), where('supplier', '==', name));
    const snap = await getDocs(q);
    return snap.size;
  },

  // Renomeia fornecedor e atualiza os agendamentos que referenciam o nome antigo.
  renameSupplier: async function (oldName, newName) {
    const q = query(collection(db, 'schedules'), where('supplier', '==', oldName));
    const snap = await getDocs(q);
    let batch = writeBatch(db);
    let count = 0;
    for (const d of snap.docs) {
      batch.update(d.ref, { supplier: newName });
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count) await batch.commit();
    return snap.size;
  },

  // ============================================================
  // BACKUP / EXPORT (fonte da verdade)
  // ============================================================

  exportAll: async function () {
    const [schedSnap, suppSnap, histSnap] = await Promise.all([
      getDocs(collection(db, 'schedules')),
      getDocs(collection(db, 'suppliers')),
      getDocs(collection(db, 'history'))
    ]);
    return {
      schedules: schedSnap.docs.map((d) => ({ id: d.id, ...exportable(d.data()) })),
      suppliers: suppSnap.docs.map((d) => ({ id: d.id, ...exportable(d.data()) })),
      history: histSnap.docs.map((d) => ({ id: d.id, ...exportable(d.data()) }))
    };
  },

  importAll: async function (data) {
    let batch = writeBatch(db);
    let count = 0;
    const write = (col, id, obj) => {
      const ref = id ? doc(db, col, id) : doc(collection(db, col));
      batch.set(ref, { ...obj, migratedAt: serverTimestamp() }, { merge: true });
      count++;
    };
    const flush = async () => {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    };
    for (const s of (data.schedules || [])) { write('schedules', s.id, s); if (count >= 400) await flush(); }
    for (const s of (data.suppliers || [])) { write('suppliers', s.id, s); if (count >= 400) await flush(); }
    for (const h of (data.history || [])) { write('history', h.id, h); if (count >= 400) await flush(); }
    if (count) await flush();
    return true;
  }
};

console.info('Firebase initialized (firebase-init.js). Firestore é a fonte da verdade.');
