import { FileStorage, MemoryStorage, LocalStorage } from './Storage.js';
import Collection from './Collection.js';

export default class LitheDB {
  constructor(storage, options = {}) {
    if (typeof storage === 'string') {
      this.storage = new FileStorage(storage);
    } else {
      this.storage = storage;
    }
    this.options = { backup: true, ...options };
    this.data = null;
    this.inTransaction = false;
    this.transactionData = null;
    this.collections = new Map();
  }

  static async create(target, options = {}) {
    let storage;
    if (typeof window !== 'undefined' && window.localStorage) {
      storage = new LocalStorage(target || 'lithe-db');
    } else {
      storage = new FileStorage(target || 'database.json');
    }
    const db = new LitheDB(storage, options);
    await db.load();
    return db;
  }

  async load() {
    this.data = await this.storage.read();
    if (!this.data.metadata) this.data.metadata = { indices: {}, relations: {}, serial: 0 };
    if (!this.data.data) this.data.data = {};
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Collection(this, name));
    }
    return this.collections.get(name);
  }

  _getCollectionData(name) {
    const root = this.inTransaction ? this.transactionData : this.data;
    if (!root.data[name]) {
      root.data[name] = [];
    }
    return root.data[name];
  }

  _setCollectionData(name, data) {
    const root = this.inTransaction ? this.transactionData : this.data;
    root.data[name] = data;
  }

  _getNextSerial() {
    const root = this.inTransaction ? this.transactionData : this.data;
    root.metadata.serial = (root.metadata.serial || 0) + 1;
    return root.metadata.serial;
  }

  async _save() {
    if (this.inTransaction) return; // Wait for commit
    if (this.options.backup) {
      await this.storage.backup();
    }
    await this.storage.write(this.data);
  }

  // Transactions
  async beginTransaction() {
    await this.load(); // Ensure fresh data
    this.inTransaction = true;
    this.transactionData = JSON.parse(JSON.stringify(this.data));
  }

  async commit() {
    if (!this.inTransaction) return;
    this.data = this.transactionData;
    this.inTransaction = false;
    this.transactionData = null;
    await this._save();
  }

  rollback() {
    this.inTransaction = false;
    this.transactionData = null;
  }

  // Relations
  defineRelation(collection, field, config) {
    const root = this.inTransaction ? this.transactionData : this.data;
    if (!root.metadata.relations[collection]) {
      root.metadata.relations[collection] = {};
    }
    root.metadata.relations[collection][field] = {
      ref: config.ref,
      field: config.field || 'id'
    };
  }

  async _checkRelations(collectionName, doc) {
    const relations = this.data.metadata.relations[collectionName];
    if (!relations) return;

    for (const [field, config] of Object.entries(relations)) {
      const val = doc[field];
      if (val === undefined || val === null) continue;

      const refCollection = this.collection(config.ref);
      const query = { [config.field]: val };
      const results = await refCollection.find(query);
      const exists = results.length > 0;

      if (!exists) {
        throw new Error(`Relation integrity error: ${field} value ${val} not found in ${config.ref}.${config.field}`);
      }
    }
  }

  async _populate(collectionName, doc) {
    const relations = this.data.metadata.relations[collectionName];
    if (!relations) return JSON.parse(JSON.stringify(doc));

    const populatedDoc = JSON.parse(JSON.stringify(doc));
    for (const [field, config] of Object.entries(relations)) {
      const val = doc[field];
      if (val === undefined || val === null) continue;

      const refCollection = this.collection(config.ref);
      const query = { [config.field]: val };
      const refDoc = await refCollection.findOne(query);

      if (refDoc) {
        populatedDoc[field] = refDoc;
      }
    }
    return populatedDoc;
  }

  // Indices (Placeholder for now, can be optimized later)
  createIndex(collection, field, options = {}) {
    const root = this.inTransaction ? this.transactionData : this.data;
    if (!root.metadata.indices[collection]) {
      root.metadata.indices[collection] = {};
    }
    root.metadata.indices[collection][field] = options;
  }

  _getIndices(collectionName) {
    const root = this.inTransaction ? this.transactionData : this.data;
    return root.metadata.indices[collectionName] || {};
  }
}
