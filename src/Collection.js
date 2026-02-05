/**
 * LitheDB内のコレクションを表すクラス。
 * ドキュメントのCRUD操作、バリデーション、リレーション、およびインデックスの管理を提供します。
 */
export default class Collection {
  /**
   * @param {LitheDB} db - 親となるLitheDBインスタンス。
   * @param {string} name - コレクション名。
   */
  constructor(db, name) {
    this.db = db;
    this.name = name;
    this.hooks = {
      beforeInsert: [],
      afterInsert: [],
      beforeUpdate: [],
      afterUpdate: [],
      beforeRemove: [],
      afterRemove: [],
      beforeUpsert: [],
      afterUpsert: []
    };
  }

  /**
   * このコレクションの生のデータ配列にアクセスするための内部ゲッター。
   * @private
   */
  get _data() {
    return this.db._getCollectionData(this.name);
  }

  /**
   * 特定のイベントに対してフック（ミドルウェア）を登録します。
   * 
   * @param {string} event - イベント名 ('beforeInsert', 'afterInsert', 'beforeUpdate', 'afterUpdate', 'beforeRemove', 'afterRemove', 'beforeUpsert', 'afterUpsert')。
   * @param {Function} callback - 実行される非同期関数。
   */
  addHook(event, callback) {
    if (this.hooks[event]) {
      this.hooks[event].push(callback);
    }
  }

  /**
   * 登録されたフックを順番に実行します。
   * @private
   */
  async _runHooks(event, ...args) {
    for (const hook of this.hooks[event]) {
      await hook(...args);
    }
  }

  /**
   * 新しいドキュメントをコレクションに挿入します。
   * ユニークな `id`、`created_at`、`updated_at` が自動的に付与されます。
   * 挿入前にユニーク制約とリレーションの整合性をチェックします。
   * 
   * @param {Object} doc - 挿入するドキュメントオブジェクト。
   * @returns {Promise<Object>} システムフィールドが付与された挿入済みドキュメント。
   * @throws {Error} ユニーク制約違反やリレーション整合性エラーの場合にスローされます。
   */
  async insert(doc) {
    await this._runHooks('beforeInsert', doc);
    // インデックスのチェック (ユニーク制約)
    const indices = this.db._getIndices(this.name);
    for (const [field, options] of Object.entries(indices)) {
      if (options.unique && doc[field] !== undefined) {
        const existing = await this.findOne({ [field]: doc[field] });
        if (existing) throw new Error(`Unique constraint violation: ${this.name}.${field} already exists with value ${doc[field]}`);
      }
    }

    // リレーションのチェック (整合性)
    await this.db._checkRelations(this.name, doc);

    const serial = this.db._getNextSerial();
    const id = `${String(serial).padStart(6, '0')}_${this.name}`;
    const now = new Date().toISOString();

    const newDoc = {
      ...doc,
      id,
      created_at: now,
      updated_at: now
    };

    this._data.push(newDoc);
    await this.db._save();
    const cloned = this._clone(newDoc);
    await this._runHooks('afterInsert', cloned);
    return cloned;
  }

  /**
   * クエリに一致するドキュメントを検索します。
   * 
   * @param {Object} [query={}] - 検索条件 (例: { category: 'tech' })。
   * @param {Object} [options={}] - 検索オプション。
   * @param {boolean} [options.populate=false] - trueの場合、リレーションを実データに展開します。
   * @param {Object} [options.sort] - ソート条件 (例: { created_at: 'desc' })。
   * @returns {Promise<Array<Object>>} 一致したドキュメントのクローン配列。
   */
  async find(query = {}, options = {}) {
    let results = this._data.filter(doc => this._match(doc, query));

    if (options.sort) {
      const [field, order] = Object.entries(options.sort)[0];
      results.sort((a, b) => {
        if (a[field] < b[field]) return order === 'asc' ? -1 : 1;
        if (a[field] > b[field]) return order === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (options.populate) {
      results = await Promise.all(results.map(doc => this.db._populate(this.name, doc)));
    } else {
      results = results.map(doc => this._clone(doc));
    }

    return results;
  }

  /**
   * クエリに一致する最初の1件を取得します。
   * 
   * @param {Object} [query={}] - 検索条件。
   * @param {Object} [options={}] - 検索オプション。
   * @param {boolean} [options.populate=false] - trueの場合、リレーションを展開します。
   * @returns {Promise<Object|null>} 一致したドキュメントのクローン、または見つからない場合はnull。
   */
  async findOne(query = {}, options = {}) {
    const doc = this._data.find(doc => this._match(doc, query));
    if (!doc) return null;

    if (options.populate) {
      return await this.db._populate(this.name, doc);
    }
    return this._clone(doc);
  }

  /**
   * クエリに一致するドキュメントを更新します。
   * `updated_at` フィールドが現在時刻に更新されます。
   * 
   * @param {Object} query - 更新対象を特定するクエリ。
   * @param {Object} updateData - マージするデータ。
   * @returns {Promise<number>} 更新されたドキュメントの数。
   * @throws {Error} 更新によってユニーク制約に違反する場合にスローされます。
   */
  async update(query, updateData) {
    await this._runHooks('beforeUpdate', query, updateData);
    const { id, created_at, updated_at, ...filteredUpdateData } = updateData;
    const now = new Date().toISOString();
    let count = 0;
    const targets = this._data.filter(doc => this._match(doc, query));

    for (const doc of targets) {
      // 更新対象のフィールドに対するユニーク制約のチェック
      const indices = this.db._getIndices(this.name);
      for (const [field, options] of Object.entries(indices)) {
        if (options.unique && filteredUpdateData[field] !== undefined && filteredUpdateData[field] !== doc[field]) {
          const existing = await this.findOne({ [field]: filteredUpdateData[field] });
          if (existing && existing.id !== doc.id) {
            throw new Error(`Unique constraint violation: ${this.name}.${field} already exists with value ${filteredUpdateData[field]}`);
          }
        }
      }

      Object.assign(doc, filteredUpdateData, { updated_at: now });
      // リレーションが更新された場合の整合性チェック
      await this.db._checkRelations(this.name, doc);
      count++;
    }

    if (count > 0) {
      await this.db._save();
    }
    // 更新後の各ドキュメントに対して個別に afterUpdate を呼ぶのは重いため、
    // ここでは更新されたドキュメントのリストを取得して実行
    if (count > 0) {
      for (const doc of targets) {
        await this._runHooks('afterUpdate', this._clone(doc));
      }
    }
    return count;
  }

  /**
   * クエリに一致するドキュメントを更新、または存在しない場合は挿入します。
   * 
   * @param {Object} query - 対象を特定するクエリ。
   * @param {Object} data - 更新または挿入するデータ。
   * @returns {Promise<Object>} 処理されたドキュメント。
   */
  async upsert(query, data) {
    await this._runHooks('beforeUpsert', query, data);
    const existing = await this.findOne(query);

    if (existing) {
      await this.update({ id: existing.id }, data);
      const updated = await this.findOne({ id: existing.id });
      await this._runHooks('afterUpsert', updated, false);
      return updated;
    } else {
      const inserted = await this.insert(data);
      await this._runHooks('afterUpsert', inserted, true);
      return inserted;
    }
  }

  /**
   * クエリに一致するドキュメントを削除します。
   * 
   * @param {Object} query - 削除対象を特定するクエリ。
   * @returns {Promise<number>} 削除されたドキュメントの数。
   */
  async remove(query) {
    await this._runHooks('beforeRemove', query);
    const initialLength = this._data.length;
    const newData = this._data.filter(doc => !this._match(doc, query));
    const count = initialLength - newData.length;

    if (count > 0) {
      this.db._setCollectionData(this.name, newData);
      await this.db._save();
    }
    await this._runHooks('afterRemove', count);
    return count;
  }

  /**
   * コレクションのデータ構造を解析し、JSON Schema形式の定義を生成します。
   * 
   * @returns {Object} 生成されたスキーマオブジェクト。
   */
  getSchema() {
    const docs = this._data;
    if (docs.length === 0) return { type: 'object', properties: {}, required: [] };

    // 解析から除外するシステムフィールド（トップレベルのみ）
    const systemFields = ['id', 'created_at', 'updated_at'];

    const analyze = (objects, isRoot = false) => {
      if (objects.length === 0) return { type: 'any' };

      const keys = new Set();
      objects.forEach(obj => {
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          Object.keys(obj).forEach(k => {
            if (!(isRoot && systemFields.includes(k))) keys.add(k);
          });
        }
      });

      const properties = {};
      const required = [];

      keys.forEach(key => {
        const values = objects
          .map(obj => (obj && typeof obj === 'object') ? obj[key] : undefined)
          .filter(v => v !== undefined);

        // その階層の全ドキュメントにキーが存在すれば必須とする
        if (values.length === objects.length) {
          required.push(key);
        }

        if (values.length === 0) return;

        // 型の判定
        const types = new Set(values.map(v => {
          if (v === null) return 'null';
          if (Array.isArray(v)) return 'array';
          return typeof v;
        }));

        let typeStr;
        if (types.size > 1) {
          typeStr = 'any';
        } else {
          typeStr = [...types][0];
        }

        const schemaNode = { type: typeStr };
        // オブジェクトの場合は再帰的に解析
        if (typeStr === 'object') {
          const nested = analyze(values, false);
          schemaNode.properties = nested.properties;
          if (nested.required.length > 0) {
            schemaNode.required = nested.required;
          }
        }
        properties[key] = schemaNode;
      });

      return { type: 'object', properties, required };
    };

    return analyze(docs, true);
  }

  /**
   * クエリマッチングのための内部ヘルパー。
   * 値の完全一致およびネストされたオブジェクトのJSON比較をサポートします。
   * 
   * @private
   */
  _match(doc, query) {
    if (typeof query === 'function') {
      return query(doc);
    }
    return Object.entries(query).every(([key, value]) => {
      if (typeof value === 'function') {
        return value(doc[key]);
      }
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return JSON.stringify(doc[key]) === JSON.stringify(value);
      }
      return doc[key] === value;
    });
  }

  /**
   * ドキュメントをディープクローンするための内部ヘルパー。
   * 返されたオブジェクトの操作がメモリ内のデータベースに影響するのを防ぎます。
   * 
   * @private
   */
  _clone(data) {
    return JSON.parse(JSON.stringify(data));
  }
}
