/*
Migration helper: localStorage -> Firestore (dry-run by default)
Usage:
  1. Serve project (http) and open login.html so firebase-init.js runs and window.FB is available.
  2. In DevTools Console:
       import './migrate-localstorage-to-firestore.js'
       // then call:
       migrate.previewMigration(); // shows counts and samples
       // to actually write to Firestore:
       await migrate.runMigration({ commit: true, overwrite: false, batchSize: 200, migrateUsers: false });

Notes:
- This script DOES NOT migrate user passwords. It creates userMeta documents (username, role) without credentials.
- Default is dry-run (commit: false). Use commit: true to perform writes.
- Requires window.FB.db initialized (firebase-init.js must have run).
*/

import { doc, setDoc, addDoc, writeBatch, serverTimestamp, getDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const KEYS = {
  schedules_cd1: 'paletes.schedules.cd1',
  schedules_cd2: 'paletes.schedules.cd2',
  suppliers: 'paletes.suppliers',
  history_cd1: 'paletes.history.cd1',
  history_cd2: 'paletes.history.cd2',
  users: 'paletes.users'
};

function safeParse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch (e) { console.warn('parse error', e); return null; }
}

function collectLocalData() {
  return {
    schedules_cd1: safeParse(localStorage.getItem(KEYS.schedules_cd1)) || [],
    schedules_cd2: safeParse(localStorage.getItem(KEYS.schedules_cd2)) || [],
    suppliers: safeParse(localStorage.getItem(KEYS.suppliers)) || [],
    history_cd1: safeParse(localStorage.getItem(KEYS.history_cd1)) || [],
    history_cd2: safeParse(localStorage.getItem(KEYS.history_cd2)) || [],
    users: safeParse(localStorage.getItem(KEYS.users)) || {}
  };
}

export const migrate = {
  previewMigration() {
    const data = collectLocalData();
    const summary = {
      schedules: (data.schedules_cd1.length || 0) + (data.schedules_cd2.length || 0),
      schedules_cd1: data.schedules_cd1.length,
      schedules_cd2: data.schedules_cd2.length,
      suppliers: data.suppliers.length,
      history: (data.history_cd1.length || 0) + (data.history_cd2.length || 0),
      users: Object.keys(data.users).length,
      samples: {
        schedule_cd1: data.schedules_cd1.slice(0,3),
        schedule_cd2: data.schedules_cd2.slice(0,3),
        suppliers: data.suppliers.slice(0,3),
        history_cd1: data.history_cd1.slice(0,3),
        users: Object.entries(data.users).slice(0,5).map(([k,v]) => ({ key:k, user:v }))
      }
    };
    console.log('Migration preview:', summary);
    return summary;
  },

  async runMigration(options = {}) {
    // options: { commit:false, overwrite:false, batchSize:200, migrateUsers:false }
    const opts = Object.assign({ commit: false, overwrite: false, batchSize: 200, migrateUsers: false }, options);
    if (!window.FB || !window.FB.db) {
      throw new Error('Firestore not initialized (window.FB.db missing). Open the app so firebase-init.js runs first.');
    }
    const db = window.FB.db;
    const data = collectLocalData();

    console.log('Starting migration (commit=' + opts.commit + ')');

    // Helper to batch set
    async function batchSets(items) {
      if (!opts.commit) return { committed: 0 };
      let committed = 0;
      let batch = writeBatch(db);
      let countInBatch = 0;
      for (const it of items) {
        batch.set(it.ref, it.data, { merge: true });
        countInBatch++;
        if (countInBatch >= opts.batchSize) {
          await batch.commit();
          committed += countInBatch;
          batch = writeBatch(db);
          countInBatch = 0;
        }
      }
      if (countInBatch > 0) {
        await batch.commit();
        committed += countInBatch;
      }
      return { committed };
    }

    // Prepare schedules
    const schedules = [].concat(
      (data.schedules_cd1 || []).map(s => ({ ...s, cd: 'cd1' })),
      (data.schedules_cd2 || []).map(s => ({ ...s, cd: 'cd2' }))
    );

    // Prepare suppliers
    const suppliers = data.suppliers || [];

    // Prepare history
    const history = [].concat(data.history_cd1 || [], data.history_cd2 || []);

    // Prepare users -> userMeta docs (no passwords)
    const usersObj = data.users || {};
    const userEntries = Object.keys(usersObj).map(key => ({ key, data: usersObj[key] }));

    console.log('Items to migrate:', { schedules: schedules.length, suppliers: suppliers.length, history: history.length, users: userEntries.length });

    if (!opts.commit) {
      console.log('Dry-run mode. No writes will be performed. Use commit:true to write.');
    }

    // Migrate suppliers: setDoc with provided id if exists, else add
    const supplierSets = suppliers.map(sp => {
      const id = sp.id || sp.name && sp.name.replace(/[^a-z0-9]/gi,'_').toLowerCase() || null;
      const ref = id ? doc(db, 'suppliers', String(id)) : doc(db, 'suppliers');
      const payload = Object.assign({}, sp, { migratedAt: serverTimestamp() });
      return { ref, data: payload };
    });

    const resSuppliers = await batchSets(supplierSets);
    console.log('Suppliers migrated (simulated):', resSuppliers);

    // Migrate schedules: use schedule.id if available
    const scheduleSets = schedules.map(sch => {
      const id = sch.id || (sch.date + '_' + sch.time + '_' + Math.random().toString(36).slice(2,8));
      const ref = doc(db, 'schedules', String(id));
      // normalize: remove any fragile local-only fields if needed
      const payload = Object.assign({}, sch);
      // preserve createdBy as username if available
      payload.migratedAt = serverTimestamp();
      return { ref, data: payload };
    });

    const resSchedules = await batchSets(scheduleSets);
    console.log('Schedules migrated (simulated):', resSchedules);

    // Migrate history
    const historySets = history.map(h => {
      const id = h.id || (h.timestamp ? ('h_' + new Date(h.timestamp).getTime()) : null);
      const ref = id ? doc(db, 'history', String(id)) : doc(db, 'history');
      const payload = Object.assign({}, h, { migratedAt: serverTimestamp() });
      return { ref, data: payload };
    });

    const resHistory = await batchSets(historySets);
    console.log('History migrated (simulated):', resHistory);

    // Migrate users -> userMeta collection (no password)
    let resUsers = { committed: 0 };
    if (opts.migrateUsers && userEntries.length) {
      const userSets = userEntries.map(u => {
        const id = u.key || (u.data && u.data.username) || null;
        const ref = id ? doc(db, 'userMeta', String(id)) : doc(db, 'userMeta');
        const payload = { username: u.data.username || u.key, role: u.data.role || 'Operador', migratedFromLocal: true, createdAt: serverTimestamp() };
        return { ref, data: payload };
      });
      resUsers = await batchSets(userSets);
      console.log('Users migrated (simulated):', resUsers);
    } else if (!opts.migrateUsers) {
      console.log('Users migration skipped (migrateUsers=false)');
    }

    return {
      suppliers: resSuppliers,
      schedules: resSchedules,
      history: resHistory,
      users: resUsers,
      commit: opts.commit
    };
  }
};

console.info('Migration helper loaded as `migrate`. Call migrate.previewMigration() or await migrate.runMigration({commit:true})');
