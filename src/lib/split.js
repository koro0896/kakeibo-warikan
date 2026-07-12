// 割り勘計算(純関数)。DBアクセスはしない。
//
// 個人負担 = 金額 × 自分のweight ÷ 参加者のweight合計
// グループ内で「支払った額 − 負担すべき額」を集計し、
// プラスの人が受け取り、マイナスの人が払う。

// 1つの支出を参加者の weight に応じて配分する。
// participants: [{ userId, weight }]
// 戻り値: [{ userId, share }](share は円の整数。端数は先頭から1円ずつ配って合計を保つ)
function calcShares(amount, participants) {
  if (!participants || participants.length === 0) {
    throw new Error('参加者がいません');
  }
  const totalWeight = participants.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('weightの合計が0以下です');
  }
  const shares = participants.map((p) => ({
    userId: p.userId,
    share: Math.floor((amount * p.weight) / totalWeight),
  }));
  let rest = amount - shares.reduce((sum, s) => sum + s.share, 0);
  for (let i = 0; rest > 0; i = (i + 1) % shares.length) {
    shares[i].share += 1;
    rest -= 1;
  }
  return shares;
}

// グループ内の収支を集計する。
// expenses: [{ payerId, amount, participants: [{ userId, weight }] }]
// 戻り値: Map<userId, balance>(プラス=受け取る、マイナス=払う)
function calcBalances(expenses) {
  const balances = new Map();
  const add = (userId, v) => balances.set(userId, (balances.get(userId) ?? 0) + v);
  for (const e of expenses) {
    add(e.payerId, e.amount); // 立て替えた分
    for (const s of calcShares(e.amount, e.participants)) {
      add(s.userId, -s.share); // 負担すべき分
    }
  }
  return balances;
}

// 送金案の作成(貪欲法で送金回数を減らす)。
// balances: Map<userId, balance>
// 戻り値: [{ from, to, amount }]
function settle(balances) {
  const receivers = [];
  const payers = [];
  for (const [userId, balance] of balances) {
    if (balance > 0) receivers.push({ userId, rest: balance });
    else if (balance < 0) payers.push({ userId, rest: -balance });
  }
  receivers.sort((a, b) => b.rest - a.rest);
  payers.sort((a, b) => b.rest - a.rest);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < payers.length && j < receivers.length) {
    const amount = Math.min(payers[i].rest, receivers[j].rest);
    if (amount > 0) {
      transfers.push({ from: payers[i].userId, to: receivers[j].userId, amount });
    }
    payers[i].rest -= amount;
    receivers[j].rest -= amount;
    if (payers[i].rest === 0) i += 1;
    if (receivers[j].rest === 0) j += 1;
  }
  return transfers;
}

module.exports = { calcShares, calcBalances, settle };
