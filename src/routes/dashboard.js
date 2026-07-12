// ダッシュボード: 当月のカテゴリ別円グラフ・必需/嗜好の内訳・予算消化率・先月比較(Must 4, Should 6, 8)
const express = require('express');
const prisma = require('../lib/prisma');
const wrap = require('../lib/wrap');
const { monthKey, monthRange } = require('../lib/date');

const router = express.Router();

router.get(
  '/dashboard',
  wrap(async (req, res) => {
    const userId = req.session.userId;
    const now = new Date();
    const { start, end } = monthRange(now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const { start: prevStart, end: prevEnd } = monthRange(prev);

    // 集計は Prisma の groupBy(SQL の GROUP BY + SUM に相当)で行う
    const [categories, byCategory, byEssential, prevByCategory, recent, budget] =
      await Promise.all([
        prisma.category.findMany({ orderBy: { id: 'asc' } }),
        prisma.expense.groupBy({
          by: ['categoryId'],
          where: { userId, spentAt: { gte: start, lt: end } },
          _sum: { amount: true },
        }),
        prisma.expense.groupBy({
          by: ['isEssential'],
          where: { userId, spentAt: { gte: start, lt: end } },
          _sum: { amount: true },
        }),
        prisma.expense.groupBy({
          by: ['categoryId'],
          where: { userId, spentAt: { gte: prevStart, lt: prevEnd } },
          _sum: { amount: true },
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

    const catName = new Map(categories.map((c) => [c.id, c.name]));

    // 円グラフ用データ(サーバー側で集計済みのものをEJSに埋め込む)
    const categoryChart = {
      labels: byCategory.map((r) => catName.get(r.categoryId) ?? '不明'),
      data: byCategory.map((r) => r._sum.amount ?? 0),
    };
    const essential = byEssential.find((r) => r.isEssential)?._sum.amount ?? 0;
    const optional = byEssential.find((r) => !r.isEssential)?._sum.amount ?? 0;
    const total = essential + optional;

    // 先月比較(Should 8)
    const currMap = new Map(byCategory.map((r) => [r.categoryId, r._sum.amount ?? 0]));
    const prevMap = new Map(prevByCategory.map((r) => [r.categoryId, r._sum.amount ?? 0]));
    const comparison = categories
      .map((c) => ({
        name: c.name,
        current: currMap.get(c.id) ?? 0,
        prev: prevMap.get(c.id) ?? 0,
      }))
      .filter((r) => r.current > 0 || r.prev > 0)
      .map((r) => ({ ...r, diff: r.current - r.prev }));

    // 予算消化率(Should 6)
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
