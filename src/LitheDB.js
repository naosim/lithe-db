import { FileStorage, MemoryStorage, LocalStorage, GoogleSheetsStorage, GASStorage } from './Storage.js';
import Collection from './Collection.js';

/**
 * LitheDB - AIフレンドリーな軽量JSONデータベース。
 * コレクション、リレーション、インデックス、およびトランザクションを管理します。
 */
export default class LitheDB {
  /**
   * @param {Storage|string} storage - ストレージアダプターのインスタンス、またはファイルパス（FileStorage用）。
   * @param {Object} [options={}] - 設定オプション。
   * @param {boolean} [options.backup=true] - 書き込み前に .bak ファイルを作成するかどうか。
   */
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

  /**
   * 現在の環境（Node.js または ブラウザ）に最適なストレージを自動選択してインスタンスを作成する静的ファクトリメソッド。
   * Node.js環境では FileStorage、ブラウザ環境では LocalStorage を使用します。
   * 
   * @param {string} [target] - ファイルパス（Node）またはストレージキー（ブラウザ）。
   * @param {Object} [options] - データベースオプション。
   * @returns {Promise<LitheDB>}
   */
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

  /**
   * ストレージからデータを読み込み、データベースを初期化します。
   */
  async load() {
    this.data = await this.storage.read();
    if (!this.data.metadata) this.data.metadata = { indices: {}, relations: {}, serial: 0 };
    if (!this.data.data) this.data.data = {};
  }

  /**
   * コレクション名からコレクション操作オブジェクトを取得または作成します。
   * @param {string} name - コレクション名。
   * @returns {Collection}
   */
  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Collection(this, name));
    }
    return this.collections.get(name);
  }

  /**
   * @private
   */
  _getCollectionData(name) {
    const root = this.inTransaction ? this.transactionData : this.data;
    if (!root.data[name]) {
      root.data[name] = [];
    }
    return root.data[name];
  }

  /**
   * @private
   */
  _setCollectionData(name, data) {
    const root = this.inTransaction ? this.transactionData : this.data;
    root.data[name] = data;
  }

  /**
   * @private
   */
  _getNextSerial() {
    const root = this.inTransaction ? this.transactionData : this.data;
    root.metadata.serial = (root.metadata.serial || 0) + 1;
    return root.metadata.serial;
  }

  /**
   * @private
   */
  async _save() {
    if (this.inTransaction) return; // トランザクション中は保存しない
    if (this.options.backup) {
      await this.storage.backup();
    }
    await this.storage.write(this.data);
  }

  /**
   * 新しいトランザクションを開始します。変更はメモリ上のサンドボックスに対して行われます。
   */
  async beginTransaction() {
    await this.load(); // 最新データを確実にロード
    this.inTransaction = true;
    this.transactionData = JSON.parse(JSON.stringify(this.data));
  }

  /**
   * 現在のトランザクションをストレージにコミット（保存）します。
   */
  async commit() {
    if (!this.inTransaction) return;
    this.data = this.transactionData;
    this.inTransaction = false;
    this.transactionData = null;
    await this._save();
  }

  /**
   * 現在のトランザクションを破棄（ロールバック）し、変更を無視します。
   */
  rollback() {
    this.inTransaction = false;
    this.transactionData = null;
  }

  /**
   * コレクション間のリレーションを定義します。
   * 
   * @param {string} collection - ソースコレクション名。
   * @param {string} field - 外部キーとして機能するソースコレクション内のフィールド名。
   * @param {Object} config - リレーション設定。
   * @param {string} config.ref - 参照先のコレクション名。
   * @param {string} [config.field='id'] - 参照先のフィールド名。
   */
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

  /**
   * @private
   */
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

  /**
   * @private
   */
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

  /**
   * コレクションのフィールドにインデックスを作成します。
   * 
   * @param {string} collection - コレクション名。
   * @param {string} field - インデックスを作成するフィールド名。
   * @param {Object} [options={}] - インデックスオプション。
   * @param {boolean} [options.unique] - ユニーク制約を適用するかどうか。
   */
  createIndex(collection, field, options = {}) {
    const root = this.inTransaction ? this.transactionData : this.data;
    if (!root.metadata.indices[collection]) {
      root.metadata.indices[collection] = {};
    }
    root.metadata.indices[collection][field] = options;
  }

  /**
   * @private
   */
  _getIndices(collectionName) {
    const root = this.inTransaction ? this.transactionData : this.data;
    return root.metadata.indices[collectionName] || {};
  }
}
