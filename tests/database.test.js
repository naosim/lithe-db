import { describe, it, expect, beforeEach } from 'vitest';
import LitheDB from '../index.js';

describe('LitheDB Core', () => {
  let db;

  beforeEach(async () => {
    // Use MemoryStorage for fast core tests
    db = new LitheDB(new LitheDB.MemoryStorage());
    await db.load();
  });

  describe('CRUD Operations', () => {
    it('should insert and find a document', async () => {
      const users = db.collection('users');
      const doc = await users.insert({ name: 'Alice' });

      expect(doc.id).toMatch(/\d{6}_users/);
      expect(doc.name).toBe('Alice');
      expect(doc.created_at).toBeDefined();

      const found = await users.findOne({ id: doc.id });
      expect(found).toEqual(doc);
    });

    it('should update a document', async () => {
      const users = db.collection('users');
      const doc = await users.insert({ name: 'Bob' });

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      const count = await users.update({ id: doc.id }, { name: 'Robert' });
      expect(count).toBe(1);

      const updated = await users.findOne({ id: doc.id });
      expect(updated.name).toBe('Robert');
      expect(updated.updated_at).not.toBe(doc.created_at);
    });

    it('should remove a document', async () => {
      const users = db.collection('users');
      const doc = await users.insert({ name: 'Charlie' });

      const count = await users.remove({ name: 'Charlie' });
      expect(count).toBe(1);

      const found = await users.findOne({ name: 'Charlie' });
      expect(found).toBeNull();
    });
  });

  describe('Indices & Constraints', () => {
    it('should enforce unique constraints', async () => {
      db.createIndex('users', 'email', { unique: true });
      const users = db.collection('users');

      await users.insert({ email: 'test@example.com' });
      await expect(users.insert({ email: 'test@example.com' }))
        .rejects.toThrow(/Unique constraint violation/);
    });
  });

  describe('Relations', () => {
    it('should check relation integrity and populate', async () => {
      db.defineRelation('posts', 'author_id', { ref: 'users' });
      const users = db.collection('users');
      const posts = db.collection('posts');

      const user = await users.insert({ name: 'Author' });

      // Valid insert
      await posts.insert({ title: 'Post 1', author_id: user.id });

      // Invalid insert
      await expect(posts.insert({ title: 'Invalid', author_id: 'non-existent' }))
        .rejects.toThrow(/Relation integrity error/);

      // Populate
      const post = await posts.findOne({ title: 'Post 1' }, { populate: true });
      expect(post.author_id.name).toBe('Author');
      expect(post.author_id.id).toBe(user.id);
    });
  });

  describe('Immutability', () => {
    it('should return clones to prevent accidental modification', async () => {
      const users = db.collection('users');
      const doc = await users.insert({ name: 'Original', meta: { score: 10 } });

      const found = await users.findOne({ id: doc.id });
      found.name = 'Changed';
      found.meta.score = 99;

      const fresh = await users.findOne({ id: doc.id });
      expect(fresh.name).toBe('Original');
      expect(fresh.meta.score).toBe(10);
    });
  });

  describe('Transactions', () => {
    it('should commit changes', async () => {
      const users = db.collection('users');
      await db.beginTransaction();
      await users.insert({ name: 'Tx User' });

      // Check that another instance (non-transaction) doesn't see it
      // Using memory storage, we can't easily simulate "another instance" without shared storage,
      // but we can check the db.data vs db.transactionData.
      expect(db.data.data.users || []).toHaveLength(0);

      await db.commit();
      expect(db.data.data.users).toHaveLength(1);
    });

    it('should rollback changes', async () => {
      const users = db.collection('users');
      await db.beginTransaction();
      await users.insert({ name: 'Ghost' });
      db.rollback();

      const all = await users.find();
      expect(all).toHaveLength(0);
    });
  });
});
