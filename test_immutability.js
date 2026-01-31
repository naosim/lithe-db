const LitheDB = require('./index');

async function testImmutability() {
  const db = new LitheDB(new LitheDB.MemoryStorage());
  await db.load();

  const users = db.collection('users');
  await users.insert({ name: 'Original', meta: { age: 30 } });

  console.log('--- Immutability Test ---');

  // 1. findOne clone test
  const user = await users.findOne({ name: 'Original' });
  user.name = 'Changed';
  user.meta.age = 40;

  const userAgain = await users.findOne({ id: user.id });
  if (userAgain.name === 'Original' && userAgain.meta.age === 30) {
    console.log('Success: Modification of returned object did not affect DB.');
  } else {
    console.log('Fail: DB was modified!', userAgain);
  }

  // 2. insert clone test
  const newUser = await users.insert({ name: 'New', meta: { score: 100 } });
  newUser.meta.score = 200;

  const newUserAgain = await users.findOne({ name: 'New' });
  if (newUserAgain.meta.score === 100) {
    console.log('Success: Modification of inserted return object did not affect DB.');
  } else {
    console.log('Fail: DB was modified after insert!', newUserAgain);
  }
}

testImmutability().catch(console.error);
