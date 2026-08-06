// firebase-init.js
// Inicialização do Firebase + helpers básicos para Firestore
// INSTRUÇÕES: substitua o objeto firebaseConfig abaixo pelas credenciais do seu projeto Firebase.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp
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

// Auto sign-in anônimo para dev: garante request.auth != null para regras que exigem autenticação
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.__fbUser = user;
    console.info('Firebase auth state changed. Signed in as:', user.uid, 'isAnonymous:', user.isAnonymous);
  } else {
    // tenta autenticar anonimamente
    signInAnonymously(auth).then((cred) => {
      console.info('Signed in anonymously:', cred.user.uid);
    }).catch((err) => {
      console.warn('Anonymous sign-in failed:', err);
    });
  }
});

// Helpers expostos em window.FB para uso a partir de scripts não-module
window.FB = {
  app,
  auth,
  db,
  // Escuta schedules em tempo real para um CD específico
  listenSchedulesByCD: function(cd, onChange) {
    try {
      const col = collection(db, 'schedules');
      const q = query(col, where('cd', '==', cd));
      const unsub = onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        onChange(docs, snap);
      }, (err) => {
        console.error('listenSchedulesByCD error', err);
      });
      return unsub;
    } catch (e) {
      console.error('listenSchedulesByCD failed', e);
      return function(){};
    }
  },

  // Cria um agendamento de forma atômica usando um lock por slot para evitar race conditions
  createScheduleAtomic: async function(payload) {
    // payload must include: cd, date (YYYY-MM-DD), time (HH:mm), supplier, pallets, status, createdBy
    const lockId = `${payload.cd}_${payload.date}_${payload.time}`.replace(/\s+/g,'_');
    const lockRef = doc(db, 'slotLocks', lockId);
    const schedulesCol = collection(db, 'schedules');

    return runTransaction(db, async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists()) {
        // if a lock exists, assume slot taken
        throw new Error('Slot already reserved');
      }
      // create schedule doc
      const newDocRef = doc(schedulesCol);
      tx.set(newDocRef, { ...payload, createdAt: serverTimestamp() });
      // create lock pointing to schedule id
      tx.set(lockRef, { scheduleId: newDocRef.id, cd: payload.cd, date: payload.date, time: payload.time, createdAt: serverTimestamp() });
      return newDocRef.id;
    });
  },

  // Liberar lock de um slot quando um agendamento é removido ou cancelado (call on cancellation)
  releaseSlotLock: async function(payload) {
    const lockId = `${payload.cd}_${payload.date}_${payload.time}`.replace(/\s+/g,'_');
    const lockRef = doc(db, 'slotLocks', lockId);
    try {
      await setDoc(lockRef, { releasedAt: serverTimestamp(), status: 'released' }, { merge: true });
    } catch (e) { console.warn('releaseSlotLock failed', e); }
  },

  addHistoryEvent: async function(event) {
    // event: { cd, scheduleId, type, action, title, details, user }
    try {
      await addDoc(collection(db, 'history'), { ...event, createdAt: serverTimestamp() });
    } catch (e) { console.error('addHistoryEvent failed', e); }
  },

  createSupplier: async function(payload) {
    try {
      const ref = await addDoc(collection(db, 'suppliers'), { ...payload, createdAt: serverTimestamp() });
      return ref.id;
    } catch (e) { console.error('createSupplier failed', e); throw e; }
  },

  // Update an existing schedule document
  updateSchedule: async function(id, patch) {
    try {
      const ref = doc(db, 'schedules', id);
      await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
      return true;
    } catch (e) {
      console.error('updateSchedule failed', e);
      throw e;
    }
  },

  // Delete a schedule and release the slot lock
  deleteSchedule: async function(id, schedule) {
    try {
      const ref = doc(db, 'schedules', id);
      await deleteDoc(ref);
      // release lock
      if (schedule && schedule.cd && schedule.date && schedule.time) {
        const lockId = `${schedule.cd}_${schedule.date}_${schedule.time}`.replace(/\s+/g,'_');
        const lockRef = doc(db, 'slotLocks', lockId);
        await setDoc(lockRef, { releasedAt: serverTimestamp(), status: 'released' }, { merge: true });
      }
      return true;
    } catch (e) {
      console.error('deleteSchedule failed', e);
      throw e;
    }
  },

  // Utility: batched updates for pendentes
  flushBatchedUpdates: async function(items) {
    // items: [{ ref: DocumentReference, patch: {...} }, ...]
    try {
      const batch = writeBatch(db);
      items.forEach(it => batch.update(it.ref, it.patch));
      await batch.commit();
    } catch (e) { console.error('flushBatchedUpdates failed', e); throw e; }
  }
};

console.info('Firebase initialized (firebase-init.js). Replace firebaseConfig with your project credentials.');
