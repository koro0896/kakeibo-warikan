// node --test src/lib/parse.test.js
const test = require('node:test');
const assert = require('node:assert');
const { parseExpenseText, extractKeywordCandidate } = require('./parse');

// テスト用の分類辞書(categoryId: 1=食費, 4=交通費)
const dict = [
  { word: 'コーラ', categoryId: 1 },
  { word: '電車', categoryId: 4 },
  { word: 'カフェ', categoryId: 1 },
  { word: 'カフェラテ', categoryId: 1 },
];
const now = new Date(2026, 6, 12); // 2026-07-12 とみなす

test('「今日コーラ(120円)買った」→ 金額・今日の日付・カテゴリを抽出', () => {
  const r = parseExpenseText('今日コーラ(120円)買った', dict, now);
  assert.strictEqual(r.amount, 120);
  assert.deepStrictEqual(r.spentAt, new Date(2026, 6, 12));
  assert.strictEqual(r.categoryId, 1);
  assert.strictEqual(r.matchedWord, 'コーラ');
});

test('「昨日」は前日になる', () => {
  const r = parseExpenseText('昨日電車で560円使った', dict, now);
  assert.strictEqual(r.amount, 560);
  assert.deepStrictEqual(r.spentAt, new Date(2026, 6, 11));
  assert.strictEqual(r.categoryId, 4);
});

test('「M月D日」形式の日付を読める', () => {
  const r = parseExpenseText('7月3日にカフェラテ 480円', dict, now);
  assert.deepStrictEqual(r.spentAt, new Date(2026, 6, 3));
  // 最長一致: 「カフェ」ではなく「カフェラテ」
  assert.strictEqual(r.matchedWord, 'カフェラテ');
});

test('未来のM月D日は前年扱いになる', () => {
  const r = parseExpenseText('12月24日 ケーキ 1500円', dict, now);
  assert.deepStrictEqual(r.spentAt, new Date(2025, 11, 24));
});

test('全角数字・桁区切りの金額も読める', () => {
  assert.strictEqual(parseExpenseText('今日ランチ1,200円', dict, now).amount, 1200);
  assert.strictEqual(parseExpenseText('コーラ(120円)', dict, now).amount, 120);
});

test('辞書にない単語は categoryId=null になり、候補語が取れる(自己成長用)', () => {
  const r = parseExpenseText('今日タピオカ 500円 買った', dict, now);
  assert.strictEqual(r.categoryId, null);
  assert.strictEqual(r.keywordCandidate, 'タピオカ');
});

test('候補語の抽出: 金額・日付・動詞・助詞を除いた品目が残る', () => {
  assert.strictEqual(extractKeywordCandidate('今日コーラ(120円)買った'), 'コーラ');
  assert.strictEqual(extractKeywordCandidate('7月3日に電車で560円使った'), '電車');
});
