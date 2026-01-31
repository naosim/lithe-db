import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStorage, FileStorage } from '../src/Storage.js';
import fs from 'fs/promises';
import path from 'path';

describe('MemoryStorage', () => {
  it('should read and write data', async () => {
    const storage = new MemoryStorage();
    const data = { foo: 'bar' };
    await storage.write(data);
    const read = await storage.read();
    expect(read).toEqual(data);
  });

  it('should backup data', async () => {
    const storage = new MemoryStorage();
    await storage.write({ a: 1 });
    await storage.backup();
    await storage.write({ a: 2 });
    expect(storage.bak).toEqual({ a: 1 });
  });
});

describe('FileStorage', () => {
  const testFile = path.join(__dirname, 'test_file_storage.json');

  beforeEach(async () => {
    try { await fs.unlink(testFile); } catch { }
    try { await fs.unlink(testFile + '.bak'); } catch { }
  });

  afterEach(async () => {
    try { await fs.unlink(testFile); } catch { }
    try { await fs.unlink(testFile + '.bak'); } catch { }
  });

  it('should read and write to disk', async () => {
    const storage = new FileStorage(testFile);
    const data = { hello: 'world' };
    await storage.write(data);

    const read = await storage.read();
    expect(read).toEqual(data);

    const exists = await storage.exists();
    expect(exists).toBe(true);
  });

  it('should create backup file', async () => {
    const storage = new FileStorage(testFile);
    await storage.write({ v: 1 });
    await storage.backup();

    const bakExists = await fs.access(testFile + '.bak').then(() => true).catch(() => false);
    expect(bakExists).toBe(true);
  });
});
