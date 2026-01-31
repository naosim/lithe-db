export default class Collection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  get _data() {
    return this.db._getCollectionData(this.name);
  }

  async insert(doc) {
    // Check indices (unique constraint)
    const indices = this.db._getIndices(this.name);
    for (const [field, options] of Object.entries(indices)) {
      if (options.unique && doc[field] !== undefined) {
        const existing = await this.findOne({ [field]: doc[field] });
        if (existing) throw new Error(`Unique constraint violation: ${this.name}.${field} already exists with value ${doc[field]}`);
      }
    }

    // Check relations (integrity)
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
    return this._clone(newDoc);
  }

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

  async findOne(query = {}, options = {}) {
    const doc = this._data.find(doc => this._match(doc, query));
    if (!doc) return null;

    if (options.populate) {
      return await this.db._populate(this.name, doc);
    }
    return this._clone(doc);
  }

  async update(query, updateData) {
    const now = new Date().toISOString();
    let count = 0;
    const targets = this._data.filter(doc => this._match(doc, query));

    for (const doc of targets) {
      // Check unique constraints for updated fields
      const indices = this.db._getIndices(this.name);
      for (const [field, options] of Object.entries(indices)) {
        if (options.unique && updateData[field] !== undefined && updateData[field] !== doc[field]) {
          const existing = await this.findOne({ [field]: updateData[field] });
          if (existing && existing.id !== doc.id) {
            throw new Error(`Unique constraint violation: ${this.name}.${field} already exists with value ${updateData[field]}`);
          }
        }
      }

      Object.assign(doc, updateData, { updated_at: now });
      // We should probably check relations here too if specific fields are updated
      await this.db._checkRelations(this.name, doc);
      count++;
    }

    if (count > 0) {
      await this.db._save();
    }
    return count;
  }

  async remove(query) {
    const initialLength = this._data.length;
    const newData = this._data.filter(doc => !this._match(doc, query));
    const count = initialLength - newData.length;

    if (count > 0) {
      this.db._setCollectionData(this.name, newData);
      await this.db._save();
    }
    return count;
  }

  _match(doc, query) {
    return Object.entries(query).every(([key, value]) => {
      // Support nested object match? Simple version for now.
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return JSON.stringify(doc[key]) === JSON.stringify(value);
      }
      return doc[key] === value;
    });
  }

  _clone(data) {
    return JSON.parse(JSON.stringify(data));
  }
}
