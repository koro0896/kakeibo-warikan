// テキスト解析(純関数)
// 「今日コーラ(120円)買った」のような1行テキストから
// { amount, spentAt, categoryId, matchedWord, keywordCandidate, memo } を取り出す。
// DBアクセスはしない: 分類辞書(keywords)は呼び出し側が引数 dictionary で渡す。

// 全角数字 → 半角数字(U+FF10〜U+FF19 → 0〜9)
function zenToHan(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

// 金額: 「120円」「1,200円」「１２０円」に対応
function parseAmount(text) {
  const m = zenToHan(text).replace(/[,、,]/g, '').match(/(\d+)\s*円/);
  return m ? Number(m[1]) : null;
}

// 日付: 「今日」「昨日」「M月D日」の3パターン(指定なしは今日扱い)
function parseDate(text, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 「一昨日」が「昨日」に誤マッチしないよう先に判定
  if (/一昨日|おととい/.test(text)) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
  }
  if (/昨日/.test(text)) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  }
  const m = zenToHan(text).match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    let d = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    // 未来の日付になってしまう場合は前年の話とみなす
    if (d > today) {
      d = new Date(today.getFullYear() - 1, Number(m[1]) - 1, Number(m[2]));
    }
    return d;
  }
  return today;
}

// カテゴリ: 辞書 [{ word, categoryId }] との最長一致
function matchCategory(text, dictionary) {
  let best = null;
  for (const k of dictionary) {
    if (k.word && text.includes(k.word) && (!best || k.word.length > best.word.length)) {
      best = k;
    }
  }
  return best; // null または { word, categoryId, ... }
}

// 辞書の自己成長用: テキストから「品目らしい単語」を1つ取り出す。
// 金額・日付・よくある動詞・助詞を取り除いた残りの最長トークンを代表語とする。
function extractKeywordCandidate(text) {
  const cleaned = text
    .replace(/[((]?[0-9０-９,、,]+\s*円[))]?/g, ' ') // 金額(括弧ごと)
    .replace(/[0-9０-９]{1,2}月[0-9０-９]{1,2}日/g, ' ') // M月D日
    .replace(/一昨日|おととい|昨日|今日|今朝|さっき|夜|朝|昼/g, ' ') // 日付語
    .replace(/を?(買った|買いました|購入した|購入|支払った|払った|食べた|飲んだ|使った|行った|した)/g, ' ') // 動詞
    .replace(/[のにでへとがはもや、。..!!??・\s]+/g, ' ') // 助詞・記号
    .trim();
  const tokens = cleaned.split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.sort((a, b) => b.length - a.length)[0];
}

// メイン関数
function parseExpenseText(text, dictionary = [], now = new Date()) {
  const matched = matchCategory(text, dictionary);
  return {
    amount: parseAmount(text),
    spentAt: parseDate(text, now),
    categoryId: matched ? matched.categoryId : null,
    matchedWord: matched ? matched.word : null,
    keywordCandidate: extractKeywordCandidate(text),
    memo: text.trim(),
  };
}

module.exports = {
  parseExpenseText,
  parseAmount,
  parseDate,
  matchCategory,
  extractKeywordCandidate,
};
