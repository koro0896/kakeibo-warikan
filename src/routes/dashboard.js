// ダッシュボード: 当月のカテゴリ別円グラフ・必需/嗜好の内訳・予算消化率・先月比較(Must 4, Should 6, 8)
//
// 集計は「支払った額」ではなく「自分の負担分(実質支出)」ベースで行う:
// - 個人支出(参加者なし)は全額が自分の負担
// - 割り勘支出は weight に応じた自分の取り分だけが負担
//   (自分が立て替えた分は送金で戻ってくるので支出に含めない。
//    逆に他人が立て替えてくれた分は、自分の取り分を支出として計上する)
const express = require('express');
const prisma = require('../lib/prisma');
const wrap = require('../lib/wrap');
const { calcShares } = require('../lib/split');
const { monthKey, monthRange } = require('../lib/date');

const router = express.Router();

router.get(
  '/dashboard',
  wrap(async (req, res) => {
    const userId = req.session.userId;
    const now = new Date();
    const { start, end } = monthRange(now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const { start: prevStart } = monthRange(prev);

    const [categories, expenses, recent, budget] = await Promise.all([
      prisma.category.findMany({ orderBy: { id: 'asc' } }),
      // 先月初〜今月末の「自分が関係する支出」をまとめて取得
      // (自分が払ったもの+自分が割り勘の参加者になっているもの)
      prisma.expense.findMany({
        where: {
          spentAt: { gte: prevStart, lt: end },
          OR: [{ userId }, { participants: { some: { userId } } }],
        },
        include: {
          participants: true,
          group: { include: { members: true } }, // weight取得(include で N+1 回避)
        },
      }),
      prisma.expense.findMany({
        where: { userId },
        include: { category: true },
        orderBy: [{ spentAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      prisma.budget.findUnique({
        where: { userId_month: { userId, month: monthKey(now) } },
      }),
    ]);

    // この支出における「自分の負担額」を計算する
    const burdenOf = (e) => {
      // 参加者なし = 個人支出。自分が払ったなら全額負担
      if (e.participants.length === 0) return e.userId === userId ? e.amount : 0;
      // 割り勘支出。参加していなければ負担0(立て替えただけなら送金で全額戻る)
      const isParticipant = e.participants.some((p) => p.userId === userId);
      if (!isParticipant) return 0;
      const weightMap = new Map((e.group?.members ?? []).map((m) => [m.userId, m.weight]));
      const shares = calcShares(
        e.amount,
        e.participants.map((p) => ({ userId: p.userId, weight: weightMap.get(p.userId) ?? 1.0 }))
      );
      return shares.find((s) => s.userId === userId)?.share ?? 0;
    };

    // 今月/先月それぞれ、カテゴリ別・必需/嗜好別に負担額を集計
    const currByCat = new Map();
    const prevByCat = new Map();
    let essential = 0;
    let optional = 0;
    let fronted = 0; // 今月、立て替え中で送金により戻ってくる予定の額(参考表示用)

    for (const e of expenses) {
      const burden = burdenOf(e);
      const isCurrentMonth = e.spentAt >= start;
      if (isCurrentMonth && e.userId === userId && e.participants.length > 0) {
        fronted += e.amount - burden; // 自分が払った額のうち他メンバー負担分
      }
      if (burden === 0) continue;
      if (isCurrentMonth) {
        if (e.isEssential) essential += burden;
        else optional += burden;
        currByCat.set(e.categoryId, (currByCat.get(e.categoryId) ?? 0) + burden);
      } else {
        prevByCat.set(e.categoryId, (prevByCat.get(e.categoryId) ?? 0) + burden);
      }
    }
    const total = essential + optional;

    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const categoryChart = {
      labels: [...currByCat.keys()].map((id) => catName.get(id) ?? '不明'),
      data: [...currByCat.values()],
    };

    // 先月比較(Should 8)
    const comparison = categories
      .map((c) => ({
        name: c.name,
        current: currByCat.get(c.id) ?? 0,
        prev: prevByCat.get(c.id) ?? 0,
      }))
      .filter((r) => r.current > 0 || r.prev > 0)
      .map((r) => ({ ...r, diff: r.current - r.prev }));

    // 予算消化率(Should 6)— 実質支出ベース
    let budgetInfo = null;
    if (budget && budget.amount > 0) {
      const rate = Math.round((total / budget.amount) * 100);
      budgetInfo = {
        amount: budget.amount,
        rate,
        barWidth: Math.min(rate, 100),
        level: rate >= 100 ? 'danger' : rate >= 80 ? 'warn' : 'ok',
      };
    }

    res.render('dashboard', {
      title: 'ダッシュボード',
      monthLabel: `${now.getFullYear()}年${now.getMonth() + 1}月`,
      prevMonthLabel: `${prev.getMonth() + 1}月`,
      total,
      essential,
      optional,
      fronted,
      categoryChart,
      comparison,
      recent,
      budgetInfo,
    });
  })
);

// 当月予算の設定(upsert)
router.post(
  '/budgets',
  wrap(async (req, res) => {
    const amount = Number(req.body.amount);
    if (Number.isInteger(amount) && amount >= 0) {
      const month = monthKey(new Date());
      await prisma.budget.upsert({
        where: { userId_month: { userId: req.session.userId, month } },
        update: { amount },
        create: { userId: req.session.userId, month, amount },
      });
    }
    res.redirect('/dashboard');
  })
);

module.exports = router;