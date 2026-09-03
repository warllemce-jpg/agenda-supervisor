/* IndexedDB falso, so o subconjunto que nucleo.js usa. Sincrono por dentro,
   assincrono na superficie via setTimeout(0). */

function criar() {
  const bancos = {};

  class Req {
    constructor() { this.result = undefined; this.error = null; }
    _ok(v) { this.result = v; setTimeout(() => this.onsuccess && this.onsuccess({ target: this }), 0); }
  }

  class Index {
    constructor(store, nome, keyPath) { this.store = store; this.nome = nome; this.keyPath = keyPath; }
    getAll(chave) {
      const r = new Req();
      const vals = [...this.store.dados.values()].filter(v => v[this.keyPath] === chave);
      r._ok(vals);
      return r;
    }
  }

  class Store {
    constructor(nome, opts) {
      this.nome = nome;
      this.keyPath = opts && opts.keyPath;
      this.autoIncrement = !!(opts && opts.autoIncrement);
      this.proxId = 1;
      this.dados = new Map();
      this.indices = {};
    }
    createIndex(nome, keyPath) { this.indices[nome] = new Index(this, nome, keyPath); return this.indices[nome]; }
    index(nome) { return this.indices[nome]; }
    get(k) { const r = new Req(); r._ok(this.dados.get(k)); return r; }
    getAll() { const r = new Req(); r._ok([...this.dados.values()]); return r; }
    put(v) {
      const r = new Req();
      let k = v[this.keyPath];
      if (k === undefined && this.autoIncrement) { k = this.proxId++; v = Object.assign({}, v, { [this.keyPath]: k }); }
      this.dados.set(k, v);
      r._ok(k);
      return r;
    }
  }

  class Tx {
    constructor(db, nomes) { this.db = db; this.nomes = nomes; this._agendarFim(); }
    objectStore(n) { return this.db.stores[n]; }
    _agendarFim() { setTimeout(() => this.oncomplete && this.oncomplete(), 1); }
  }

  class DB {
    constructor(nome, versao) { this.name = nome; this.version = versao; this.stores = {}; this.objectStoreNames = { contains: (n) => n in this.stores }; }
    createObjectStore(n, o) { this.stores[n] = new Store(n, o); return this.stores[n]; }
    transaction(n) { return new Tx(this, n); }
    close() {}
  }

  return {
    open(nome, versao) {
      const r = new Req();
      setTimeout(() => {
        let db = bancos[nome];
        const novo = !db;
        if (novo) { db = bancos[nome] = new DB(nome, versao); }
        if (novo && r.onupgradeneeded) r.onupgradeneeded({ target: { result: db } });
        r.result = db;
        r.onsuccess && r.onsuccess({ target: r });
      }, 0);
      return r;
    },
    _limpar() { for (const k of Object.keys(bancos)) delete bancos[k]; }
  };
}

module.exports = { criar };
