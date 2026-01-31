const LitheDB = require('./index');
const fs = require('fs').promises;

async function runTest() {
  const dbFile = 'test_db.json';

  // Cleanup previous test
  try {
    await fs.unlink(dbFile);
    await fs.unlink(dbFile + '.bak');
  } catch (e) { }

  console.log('--- Database Initialization ---');
  const db = await LitheDB.create(dbFile);

  console.log('--- Inserting Users ---');
  const users = db.collection('users');
  const user1 = await users.insert({ name: '田中 太郎', email: 'tanaka@example.com' });
  const user2 = await users.insert({ name: '佐藤 花子', email: 'sato@example.com' });

  console.log('Inserted:', user1.id, user2.id);

  console.log('--- Defining Relation ---');
  db.defineRelation('posts', 'author_email', { ref: 'users', field: 'email' });

  console.log('--- Unique Index Test ---');
  db.createIndex('users', 'email', { unique: true });
  try {
    await users.insert({ name: 'Duplicate', email: 'tanaka@example.com' });
    console.log('Fail: Unique constraint should have blocked this.');
  } catch (e) {
    console.log('Caught expected unique error:', e.message);
  }
  const posts = db.collection('posts');
  const post1 = await posts.insert({
    title: 'Hello World',
    author_email: 'tanaka@example.com'
  });
  console.log('Inserted Post:', post1.id);

  try {
    console.log('--- Integrity Check (Should fail) ---');
    await posts.insert({
      title: 'Invalid Author',
      author_email: 'nobody@example.com'
    });
  } catch (e) {
    console.log('Caught expected error:', e.message);
  }

  console.log('--- Find with Populate ---');
  const foundPost = await posts.findOne({ title: 'Hello World' }, { populate: true });
  console.log('Post:', foundPost.title);
  console.log('Author Object:', foundPost.author_email);

  console.log('--- Transaction Test ---');
  await db.beginTransaction();
  const txUsers = db.collection('users');
  await txUsers.insert({ name: '鈴木 一郎', email: 'suzuki@example.com' });

  // Outside transaction shouldn't see it yet
  const db2 = await LitheDB.create(dbFile);
  const outsideUsers = await db2.collection('users').find({ email: 'suzuki@example.com' });
  console.log('Outside TX count (should be 0):', outsideUsers.length);

  await db.commit();
  const afterCommitUsers = await users.find({ email: 'suzuki@example.com' });
  console.log('After Commit count (should be 1):', afterCommitUsers.length);

  console.log('--- Update Test ---');
  await users.update({ email: 'tanaka@example.com' }, { name: '田中 二郎' });
  const updatedUser = await users.findOne({ email: 'tanaka@example.com' });
  console.log('Updated Name:', updatedUser.name);
  console.log('Updated At:', updatedUser.updated_at);

  console.log('--- Remove Test ---');
  await users.remove({ email: 'suzuki@example.com' });
  const count = (await users.find()).length;
  console.log('User count after removal (should be 2):', count);

  console.log('--- All Tests Passed! ---');
}

runTest().catch(console.error);
