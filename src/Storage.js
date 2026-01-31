/**
 * ベースとなるストレージインターフェース。
 * カスタムストレージを実装する場合は、これらのメソッドを実装する必要があります。
 * @interface
 */
export class Storage {
  /** 
   * データの読み込み 
   * @returns {Promise<any>}
   */
  async read() { throw new Error('Not implemented'); }
  /** 
   * データの書き込み 
   * @param {any} data 
   * @returns {Promise<void>}
   */
  async write(data) { throw new Error('Not implemented'); }
  /** 
   * データの存在確認 
   * @returns {Promise<boolean>}
   */
  async exists() { throw new Error('Not implemented'); }
  /** 
   * バックアップの作成 
   * @returns {Promise<void>}
   */
  async backup() { throw new Error('Not implemented'); }
}

/**
 * Node.js専用のファイルベースストレージ。
 * 書き込み中の破損を防ぐため、一時ファイルへの書き込みとリネーム（Atomic Write）を使用します。
 */
export class FileStorage extends Storage {
  /**
   * @param {string} filePath - JSONファイルの保存先パス。
   */
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.fs = null;
  }

  /**
   * @private
   */
  async _getFs() {
    if (this.fs) return this.fs;
    if (typeof window !== 'undefined') {
      throw new Error('FileStorage is only available in Node.js environment');
    }
    // ブラウザバンドル時のエラーを避けるための動的インポート
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

/**
 * メモリ上でデータを保持するストレージ。
 * テストや一時的なデータ管理に最適です。
 */
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

/**
 * ブラウザの localStorage を使用した永続化ストレージ。
 */
export class LocalStorage extends Storage {
  /**
   * @param {string} key - localStorage で使用するキー名。
   */
  constructor(key) {
    super();
    this.key = key;
  }

  /**
   * @private
   */
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

/**
 * Google Spreadsheets を使用した永続化ストレージ。
 * 各コレクションを個別のシートとして保存し、メタデータを '_metadata' シートに管理します。
 */
export class GoogleSheetsStorage extends Storage {
  /**
   * @param {Object} config - 設定オブジェクト。
   * @param {string} config.spreadsheetId - Google スプレッドシートのID。
   * @param {any} config.auth - googleapis で使用する認証オブジェクト (JWT, OAuth2, etc.)。
   */
  constructor(config = {}) {
    super();
    this.spreadsheetId = config.spreadsheetId;
    this.auth = config.auth;
    this._sheets = null;
  }

  /**
   * @private
   */
  async _getSheetsClient() {
    if (this._sheets) return this._sheets;
    try {
      const { google } = await import('googleapis');
      this._sheets = google.sheets({ version: 'v4', auth: this.auth });
      return this._sheets;
    } catch (error) {
      throw new Error('GoogleSheetsStorage requires "googleapis" package. Please install it with "npm install googleapis".');
    }
  }

  async read() {
    const sheets = await this._getSheetsClient();
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      const sheetNames = spreadsheet.data.sheets.map(s => s.properties.title);

      const db = { metadata: { indices: {}, relations: {}, serial: 0 }, data: {} };

      // 各シートを読み込み
      for (const name of sheetNames) {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: name // シート名指定で全データを取得
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) continue;

        if (name === '_metadata') {
          try {
            db.metadata = JSON.parse(rows[0][0]);
          } catch {
            // 不正なメタデータは無視
          }
        } else if (!name.endsWith('.bak')) {
          const headers = rows[0];
          const dataRows = rows.slice(1);
          db.data[name] = dataRows.map(row => {
            const doc = {};
            headers.forEach((header, i) => {
              let val = row[i];
              if (val === undefined || val === '') {
                val = null;
              } else if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
                try {
                  val = JSON.parse(val);
                } catch {
                  // JSONではない通常の文字列として扱う
                }
              }
              doc[header] = val;
            });
            return doc;
          });
        }
      }
      return db;
    } catch (error) {
      if (error.code === 404) {
        return { metadata: { indices: {}, relations: {}, serial: 0 }, data: {} };
      }
      throw error;
    }
  }

  async write(data) {
    const sheets = await this._getSheetsClient();

    // 1. メタデータの更新
    await this._ensureSheet(sheets, '_metadata');
    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: '_metadata!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [[JSON.stringify(data.metadata)]] }
    });

    // 2. コレクションデータの更新
    for (const [name, items] of Object.entries(data.data)) {
      await this._ensureSheet(sheets, name);

      let values = [[]];
      if (items.length > 0) {
        // 全アイテムから一意なヘッダーを抽出
        const headers = [...new Set(items.flatMap(item => Object.keys(item)))];
        values = [headers];

        items.forEach(item => {
          const row = headers.map(h => {
            const val = item[h];
            if (val !== null && typeof val === 'object') {
              return JSON.stringify(val);
            }
            return val === undefined ? null : val;
          });
          values.push(row);
        });
      }

      // シートをクリアして新しいデータを書き込む
      await sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${name}!A:Z`
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${name}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }
  }

  /**
   * @private
   */
  async _ensureSheet(sheets, title) {
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      const exists = spreadsheet.data.sheets.some(s => s.properties.title === title);
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: { properties: { title } }
            }]
          }
        });
      }
    } catch (error) {
      // 無視またはログ
    }
  }

  async exists() {
    try {
      const sheets = await this._getSheetsClient();
      await sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      return true;
    } catch {
      return false;
    }
  }

  async backup() {
    // 簡易的なバックアップとして _metadata を _metadata.bak にコピー
    const sheets = await this._getSheetsClient();
    try {
      const metadata = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '_metadata!A1'
      });
      if (metadata.data.values && metadata.data.values[0]) {
        await this._ensureSheet(sheets, '_metadata.bak');
        await sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: '_metadata.bak!A1',
          valueInputOption: 'RAW',
          requestBody: { values: [metadata.data.values[0]] }
        });
      }
    } catch {
      // バックアップ失敗は致命的でないものとする
    }
  }
}

/**
 * Google Apps Script (GAS) 環境専用のストレージ。
 * SpreadsheetApp を直接使用するため、googleapis パッケージは不要です。
 */
export class GASStorage extends Storage {
  /**
   * @param {Object} [config={}] - 設定オブジェクト。
   * @param {string} [config.spreadsheetId] - スプレッドシートID。省略した場合は SpreadsheetApp.getActiveSpreadsheet() を使用します。
   */
  constructor(config = {}) {
    super();
    this.spreadsheetId = config.spreadsheetId;
  }

  /**
   * @private
   */
  _getSpreadsheet() {
    if (typeof SpreadsheetApp === 'undefined') {
      throw new Error('GASStorage is only available in Google Apps Script environment');
    }
    if (this.spreadsheetId) {
      return SpreadsheetApp.openById(this.spreadsheetId);
    }
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  async read() {
    const ss = this._getSpreadsheet();
    const sheets = ss.getSheets();
    const db = { metadata: { indices: {}, relations: {}, serial: 0 }, data: {} };

    for (const sheet of sheets) {
      const name = sheet.getName();
      const values = sheet.getDataRange().getValues();
      if (!values || values.length === 0 || (values.length === 1 && values[0][0] === '')) continue;

      if (name === '_metadata') {
        try {
          db.metadata = JSON.parse(values[0][0]);
        } catch {
          // 不正なメタデータは無視
        }
      } else if (!name.endsWith('.bak')) {
        const headers = values[0];
        const dataRows = values.slice(1);
        db.data[name] = dataRows.map(row => {
          const doc = {};
          headers.forEach((header, i) => {
            let val = row[i];
            if (val === undefined || val === '') {
              val = null;
            } else if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
              try {
                val = JSON.parse(val);
              } catch {
                // String
              }
            }
            doc[header] = val;
          });
          return doc;
        });
      }
    }
    return db;
  }

  async write(data) {
    const ss = this._getSpreadsheet();

    // 1. メタデータ
    let metaSheet = ss.getSheetByName('_metadata');
    if (!metaSheet) metaSheet = ss.insertSheet('_metadata');
    metaSheet.clear();
    metaSheet.getRange(1, 1).setValue(JSON.stringify(data.metadata));

    // 2. コレクション
    for (const [name, items] of Object.entries(data.data)) {
      let sheet = ss.getSheetByName(name);
      if (!sheet) sheet = ss.insertSheet(name);
      sheet.clear();

      if (items.length > 0) {
        const headers = [...new Set(items.flatMap(item => Object.keys(item)))];
        const values = [headers];

        items.forEach(item => {
          const row = headers.map(h => {
            const val = item[h];
            if (val !== null && typeof val === 'object') {
              return JSON.stringify(val);
            }
            return val === undefined ? null : val;
          });
          values.push(row);
        });

        sheet.getRange(1, 1, values.length, headers.length).setValues(values);
      }
    }
  }

  async exists() {
    try {
      this._getSpreadsheet();
      return true;
    } catch {
      return false;
    }
  }

  async backup() {
    const ss = this._getSpreadsheet();
    const metaSheet = ss.getSheetByName('_metadata');
    if (metaSheet) {
      let bakSheet = ss.getSheetByName('_metadata.bak');
      if (!bakSheet) bakSheet = ss.insertSheet('_metadata.bak');
      bakSheet.clear();
      metaSheet.getDataRange().copyTo(bakSheet.getRange(1, 1));
    }
  }
}
