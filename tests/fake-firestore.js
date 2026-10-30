// Minimal in-memory Firestore (admin SDK surface used by the functions) for tests.
let autoId = 0;
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function applyValue(cur, v) {
  const n = v?.constructor?.name;
  if (n === "NumericIncrementTransform") return (Number(cur) || 0) + v.operand;
  if (n === "ServerTimestampTransform") return { seconds: Math.floor(Date.now() / 1000) + autoId++ * 0.001, toDate() { return new Date(this.seconds * 1000); }, toMillis() { return this.seconds * 1000; } };
  if (n === "ArrayUnionTransform") return [...new Set([...(cur || []), ...v.elements])];
  if (n === "ArrayRemoveTransform") return (cur || []).filter((x) => !v.elements.includes(x));
  if (n === "DeleteTransform") return undefined;
  return v;
}

function setPath(obj, path, v) {
  const parts = path.split(".");
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p] = o[p] && typeof o[p] === "object" ? o[p] : {};
  const last = parts[parts.length - 1];
  const nv = applyValue(o[last], v);
  if (nv === undefined) delete o[last];
  else o[last] = nv;
}

function isPlain(v) {
  return v && typeof v === "object" && !Array.isArray(v) && (v.constructor === Object || !v.constructor);
}

function mergeInto(target, data, prefix = "") {
  for (const [k, v] of Object.entries(data)) {
    if (isPlain(v)) {
      if (!isPlain(target[k])) target[k] = {};
      mergeInto(target[k], v);
    } else {
      const nv = applyValue(target[k], v);
      if (nv === undefined) delete target[k];
      else target[k] = nv;
    }
  }
}

function getField(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export class FakeDB {
  constructor() { this.docs = new Map(); }
  doc(path) { return new DocRef(this, path); }
  collection(name) { return new Query(this, name); }
  batch() { return new Writer(this); }
  async runTransaction(fn) {
    const w = new Writer(this);
    const tx = Object.assign(w, {
      get: (r) => {
        if (w.ops.length) throw new Error("Transaction read after write: " + (r.path || r.col));
        return r.get();
      },
    });
    const res = await fn(tx);
    await w.commit();
    return res;
  }
  dump(col) { return [...this.docs.entries()].filter(([k]) => k.startsWith(col + "/") && k.split("/").length === 2).map(([k, v]) => ({ id: k.split("/")[1], ...v })); }
}

class DocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split("/").pop(); }
  async get() {
    const d = this.db.docs.get(this.path);
    return { exists: Boolean(d), id: this.id, ref: this, data: () => clone(d) };
  }
  async set(data, opt) { const w = new Writer(this.db); w.set(this, data, opt); await w.commit(); }
  async update(data) { const w = new Writer(this.db); w.update(this, data); await w.commit(); }
}

class Query {
  constructor(db, col, filters = [], lim = null) { this.db = db; this.col = col; this.filters = filters; this.lim = lim; }
  doc(id) { return new DocRef(this.db, `${this.col}/${id || "auto" + ++autoId}`); }
  where(f, op, v) { return new Query(this.db, this.col, [...this.filters, [f, op, v]], this.lim); }
  limit(n) { return new Query(this.db, this.col, this.filters, n); }
  orderBy() { return this; }
  select() { return this; }
  async get() {
    let rows = this.db.dump(this.col).filter((d) => this.filters.every(([f, op, v]) => {
      const x = getField(d, f);
      if (op === "==") return x === v;
      if (op === "in") return v.includes(x);
      if (op === "array-contains") return Array.isArray(x) && x.includes(v);
      if (op === ">=") return x >= v;
      if (op === "<=") return (typeof x === "object" && x?.seconds ? x.seconds * 1000 : x) <= (v?.toMillis ? v.toMillis() : v);
      throw new Error("op " + op);
    }));
    if (this.lim) rows = rows.slice(0, this.lim);
    const docs = rows.map(({ id, ...data }) => ({ id, ref: new DocRef(this.db, `${this.col}/${id}`), exists: true, data: () => clone(data) }));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (f) => docs.forEach(f) };
  }
}

class Writer {
  constructor(db) { this.db = db; this.ops = []; }
  set(ref, data, opt) { this.ops.push(["set", ref.path, data, opt]); return this; }
  update(ref, data) { this.ops.push(["update", ref.path, data]); return this; }
  delete(ref) { this.ops.push(["delete", ref.path]); return this; }
  async commit() {
    for (const [op, path, data, opt] of this.ops) {
      if (op === "delete") { this.db.docs.delete(path); continue; }
      const cur = this.db.docs.get(path);
      if (op === "update" && !cur) throw new Error(`update on missing doc ${path}`);
      const base = op === "set" && !opt?.merge ? {} : clone(cur || {});
      if (op === "update") for (const [k, v] of Object.entries(data)) setPath(base, k, v);
      else mergeInto(base, data);
      // Restore sentinel-produced timestamp helpers lost in clone.
      this.db.docs.set(path, base);
    }
    this.ops = [];
  }
}

export class FakeAuth {
  constructor() { this.users = new Map(); this.claims = {}; }
  async verifyIdToken(t) { return { uid: t, email: this.users.get(t)?.email }; }
  async getUserByEmail(email) { for (const [uid, u] of this.users) if (u.email === email) return { uid, ...u }; throw new Error("not found"); }
  async createUser(u) { const uid = "uid" + ++autoId; this.users.set(uid, u); return { uid, ...u }; }
  async setCustomUserClaims(uid, c) { this.claims[uid] = c; }
  async generatePasswordResetLink(email) { return `https://reset.example/${email}`; }
  async updateUser() {}
  async revokeRefreshTokens() {}
}
