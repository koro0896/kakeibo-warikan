// 支出の登録(テキスト解析 → 確認 → 確定)・一覧・編集・削除(Must 2, 3)
// PRGパターン(POST → Redirect → GET)。fetch は使わない。
const express = require('express');
const prisma = require('../lib/prisma');
const wrap = require('../lib/wrap');
const { parseExpenseText } = require('../lib/parse');
const { toInputDate } = require('../lib/date');

const router = express.Router();

// 自分がメンバーのグループ(参加者チェックボックス用にメンバーも取得)
function myGroups(userId) {
  return prisma.group.findMany({
    where: { members: { some: { userId } } },
    include: { members: { include: { user: true } } }, // include で N+1 回避
    orderBy: { id: 'asc' },
  });
}

// 1. テキスト1行入力フォーム
router.get('/expenses/new', (req, res) => {
  res.render('expense-new', { title: '支出を記録', error: null });
});

// 2. 解析 → 確認画面(修正可能なフォーム)
router.post(
  '/expenses/parse',
  wrap(async (req, res) => {
    const text = (req.body.text || '').trim();
    if (!text) {
      return res
        .status(400)
        .render('expense-new', { title: '支出を記録', error: '内容を入力してください' });
    }
    const [dictionary, categories, groups] = await Promise.all([
      prisma.keyword.findMany(),
      prisma.category.findMany({ orderBy: { id: 'asc' } }),
      myGroups(req.session.userId),
    ]);
    const parsed = parseExpenseText(text, dictionary);
    // 辞書にヒットしなければ「その他」に仮分類
    const fallback = categories.find((c) => c.name === 'その他') || categories[0];
    const category = categories.find((c) => c.id === parsed.categoryId) || fallback;
    res.render('expense-confirm', {
      title: '内容を確認',
      categories,
      groups,
      parsed: {
        ...parsed,
        categoryId: category.id,
        isEssential: category.defaultIsEssential, // 客観区分を初期値に(主観で上書き可)
      },
      spentAtValue: toInputDate(parsed.spentAt),
    });
  })
);

// 3. 確定(INSERT)→ 一覧へリダイレクト
router.post(
  '/expenses',
  wrap(async (req, res) => {
    const userId = req.session.userId;
    const amount = Number(req.body.amount);
    const categoryId = Number(req.body.categoryId);
    const isEssential = req.body.isEssential === '1';
    const memo = (req.body.memo || '').trim();
    const spentAt = new Date(`${req.body.spentAt}T00:00:00`);
    let groupId = req.body.groupId ? Number(req.body.groupId) : null;

    if (!Number.isInteger(amount) || amount <= 0 || Number.isNaN(spentAt.getTime())) {
      return res
        .status(400)
        .render('expense-new', { title: '支出を記録', error: '金額と日付を正しく入力してください' });
    }

    // グループ支出なら参加者を検証(自分がメンバーのグループのみ・メンバー外のIDは弾く)
    let participantIds = [];
    if (groupId) {
      const members = await prisma.groupMember.findMany({ where: { groupId } });
      const memberIds = new Set(members.map((m) => m.userId));
      if (!memberIds.has(userId)) {
        groupId = null;
      } else {
        participantIds = [].concat(req.body[`participants_${groupId}`] || [])
          .map(Number)
          .filter((id) => memberIds.has(id));
        if (participantIds.length === 0) participantIds = [...memberIds]; // 未選択なら全員
      }
    }

    await prisma.expense.create({
      data: {
        userId,
        groupId,
        amount,
        categoryId,
        isEssential,
        memo,
        spentAt,
        participants: { create: participantIds.map((id) => ({ userId: id })) },
      },
    });

    // Could 9: 分類辞書の自己成長
    // 確認画面で提案と違うカテゴリに手修正されたら、品目候補語をそのカテゴリの語彙として登録する
    const suggested = req.body.suggestedCategoryId ? Number(req.body.suggestedCategoryId) : null;
    const word = (req.body.keywordCandidate || '').trim();
    if (word && word.length >= 2 && word.length <= 20 && categoryId !== suggested) {
      await prisma.keyword.upsert({
        where: { word },
        update: { categoryId },
        create: { word, categoryId },
      });
    }

    res.redirect('/expenses');
  })
);

// 一覧(いつ・何に・いくら・誰が)
router.get(
  '/expenses',
  wrap(async (req, res) => {
    const expenses = await prisma.expense.findMany({
      where: { userId: req.session.userId },
      include: { category: true, user: true, group: true }, // include で N+1 回避
      orderBy: [{ spentAt: 'desc' }, { id: 'desc' }],
    });
    res.render('expenses', { title: '支出一覧', expenses });
  })
);

// 編集フォーム
router.get(
  '/expenses/:id/edit',
  wrap(async (req, res) => {
    const expense = await prisma.expense.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!expense || expense.userId !== req.session.userId) return res.redirect('/expenses');
    const categories = await prisma.category.findMany({ orderBy: { id: 'asc' } });
    res.render('expense-edit', {
      title: '支出を編集',
      expense,
      categories,
      spentAtValue: toInputDate(expense.spentAt),
    });
  })
);

// 更新
router.post(
  '/expenses/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense || expense.userId !== req.session.userId) return res.redirect('/expenses');

    const amount = Number(req.body.amount);
    const spentAt = new Date(`${req.body.spentAt}T00:00:00`);
    if (!Number.isInteger(amount) || amount <= 0 || Number.isNaN(spentAt.getTime())) {
      return res.redirect(`/expenses/${id}/edit`);
    }
    await prisma.expense.update({
      where: { id },
      data: {
        amount,
        categoryId: Number(req.body.categoryId),
        isEssential: req.body.isEssential === '1',
        memo: (req.body.memo || '').trim(),
        spentAt,
      },
    });
    res.redirect('/expenses');
  })
);

// 削除(participants は onDelete: Cascade で一緒に消える)
router.post(
  '/expenses/:id/delete',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (expense && expense.userId === req.session.userId) {
      await prisma.expense.delete({ where: { id } });
    }
    res.redirect('/expenses');
  })
);

module.exports = router;
