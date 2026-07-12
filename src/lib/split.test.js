// node --test src/lib/split.test.js
const test = require('node:test');
const assert = require('node:assert');
const { calcShares, calcBalances, settle } = require('./split');

test('均等割り: 3000円を3人で → 1000円ずつ', () => {
  const shares = calcShares(3000, [
    { userId: 1, weight: 1.0 },
    { userId: 2, weight: 1.0 },
    { userId: 3, weight: 1.0 },
  ]);
  assert.deepStrictEqual(
    shares.map((s) => s.share),
    [1000, 1000, 1000]
  );
});

test('端数が出ても合計は元の金額と一致する', () => {
  const shares = calcShares(100, [
    { userId: 1, weight: 1.0 },
    { userId: 2, weight: 1.0 },
    { userId: 3, weight: 1.0 },
  ]);
  assert.strictEqual(shares.reduce((s, x) => s + x.share, 0), 100);
});

test('傾斜割り: weight 2:1 なら 2000円と1000円', () => {
  const shares = calcShares(3000, [
    { userId: 1, weight: 2.0 },
    { userId: 2, weight: 1.0 },
  ]);
  assert.deepStrictEqual(
    shares.map((s) => s.share),
    [2000, 1000]
  );
});

test('精算: 1人が3000円立て替え、3人で均等割り', () => {
  const balances = calcBalances([
    {
      payerId: 1,
      amount: 3000,
      participants: [
        { userId: 1, weight: 1.0 },
        { userId: 2, weight: 1.0 },
        { userId: 3, weight: 1.0 },
      ],
    },
  ]);
  assert.strictEqual(balances.get(1), 2000); // 受け取る
  assert.strictEqual(balances.get(2), -1000); // 払う
  assert.strictEqual(balances.get(3), -1000);

  const transfers = settle(balances);
  assert.strictEqual(transfers.length, 2);
  assert.strictEqual(
    transfers.reduce((s, t) => s + t.amount, 0),
    2000
  );
  for (const t of transfers) assert.strictEqual(t.to, 1);
});

test('相殺されて送金回数が減る(貪欲法)', () => {
  // A→B 1000, B→A 1000 の貸し借りは送金不要になる
  const balances = calcBalances([
    { payerId: 1, amount: 2000, participants: [{ userId: 1, weight: 1 }, { userId: 2, weight: 1 }] },
    { payerId: 2, amount: 2000, participants: [{ userId: 1, weight: 1 }, { userId: 2, weight: 1 }] },
  ]);
  assert.deepStrictEqual(settle(balances), []);
});
