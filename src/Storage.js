export class Storage {
  async read() { throw new Error('Not implemented'); }
  async write(data) { throw new Error('Not implemented'); }
  async exists() { throw new Error('Not implemented'); }
  async backup() { throw new Error('Not implemented'); }
}

export class FileStorage extends Storage {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.fs = null;
  }

  async _getFs() {
    if (this.fs) return this.fs;
    if (typeof window !== 'undefined') {
      throw new Error('FileStorage is only available in Node.js environment');
    }
    // Dynamic import to avoid browser bundle errors
    const mod = await import('node:fs/promises');
    this.fs = mod;
    return this.fs;
  }

  async read() {
    const fs = await this._getFs();
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { metadata: { indices: {}, relations: {}, serial: 0 }, data: {} };
      }
      throw error;
    }
  }

  async write(data) {
    const fs = await this._getFs();
    const tempPath = this.filePath + '.tmp';
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(tempPath, json, 'utf8');

    for (let i = 0; i < 5; i++) {
      try {
        await fs.rename(tempPath, this.filePath);
        return;
      } catch (error) {
        if (i === 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
      }
    }
  }

  async exists() {
    const fs = await this._getFs();
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  async backup() {
    const fs = await this._getFs();
    if (await this.exists()) {
      const bakPath = this.filePath + '.bak';
      for (let i = 0; i < 5; i++) {
        try {
          await fs.copyFile(this.filePath, bakPath);
          return;
        } catch (error) {
          if (i === 4) throw error;
          await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
        }
      }
    }
  }
}

export class MemoryStorage extends Storage {
  constructor(initialData = null) {
    super();
    this.data = initialData || { metadata: { indices: {}, relations: {}, serial: 0 }, data: {} };
  }

  async read() {
    return JSON.parse(JSON.stringify(this.data));
  }

  async write(data) {
    this.data = JSON.parse(JSON.stringify(data));
  }

  async exists() {
    return true;
  }

  async backup() {
    this.bak = JSON.parse(JSON.stringify(this.data));
  }
}

export class LocalStorage extends Storage {
  constructor(key) {
    super();
    this.key = key;
  }

  _getStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    throw new Error('LocalStorage is only available in browser environment');
  }

  async read() {
    const storage = this._getStorage();
    const data = storage.getItem(this.key);
    return data ? JSON.parse(data) : { metadata: { indices: {}, relations: {}, serial: 0 }, data: {} };
  }

  async write(data) {
    const storage = this._getStorage();
    storage.setItem(this.key, JSON.stringify(data));
  }

  async exists() {
    try {
      const storage = this._getStorage();
      return storage.getItem(this.key) !== null;
    } catch {
      return false;
    }
  }

  async backup() {
    const storage = this._getStorage();
    const data = await this.read();
    storage.setItem(this.key + '.bak', JSON.stringify(data));
  }
}
