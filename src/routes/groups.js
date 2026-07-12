// グループと割り勘(Must 5, Should 7, Could 10)
const express = require('express');
const prisma = require('../lib/prisma');
const wrap = require('../lib/wrap');
const { calcBalances, settle } = require('../lib/split');

const router = express.Router();

// 職業プリセット比率(Should 7)
const OCCUPATION_PRESET = {
  社会人: 1.5,
  大学院生: 1.2,
  大学生: 1.0,
  高校生: 0.8,
};

// 自分がメンバーであることを確認しつつグループを読む
async function loadGroupForMember(groupId, userId) {
  if (!Number.isInteger(groupId)) return null;
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: { include: { user: true } },
      expenses: {
        include: { user: true, category: true, participants: true },
        orderBy: [{ spentAt: 'desc' }, { id: 'desc' }],
      },
    },
  });
  if (!group || !group.members.some((m) => m.userId === userId)) return null;
  return group;
}

// グループ一覧+作成フォーム
router.get(
  '/groups',
  wrap(async (req, res) => {
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId: req.session.userId } } },
      include: { members: { include: { user: true } } },
      orderBy: { id: 'asc' },
    });
    res.render('groups', { title: 'グループ', groups });
  })
);

// グループ作成(作成者を weight=1.0 でメンバーに)
router.post(
  '/groups',
  wrap(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect('/groups');
    const group = await prisma.group.create({
      data: {
        name,
        members: { create: [{ userId: req.session.userId, weight: 1.0 }] },
      },
    });
    res.redirect(`/groups/${group.id}`);
  })
);

// グループ詳細(メンバー・weight・支出・精算結果)
router.get(
  '/groups/:id',
  wrap(async (req, res) => {
    const group = await loadGroupForMember(Number(req.params.id), req.session.userId);
    if (!group) return res.redirect('/groups');

    const weightMap = new Map(group.members.map((m) => [m.userId, m.weight]));
    const nameMap = new Map(group.members.map((m) => [m.userId, m.user.name]));

    // 割り勘計算(純関数 split.js に渡す形に整形)
    const splitInput = group.expenses
      .filter((e) => e.participants.length > 0)
      .map((e) => ({
        payerId: e.userId,
        amount: e.amount,
        participants: e.participants.map((p) => ({
          userId: p.userId,
          weight: weightMap.get(p.userId) ?? 1.0,
        })),
      }));
    const balances = calcBalances(splitInput);
    const transfers = settle(balances).map((t) => ({
      from: nameMap.get(t.from) ?? '不明',
      to: nameMap.get(t.to) ?? '不明',
      amount: t.amount,
    }));
    const balanceRows = group.members.map((m) => ({
      name: m.user.name,
      balance: balances.get(m.userId) ?? 0,
    }));

    res.render('group', {
      title: group.name,
      group,
      balanceRows,
      transfers,
      error: req.query.error || null,
    });
  })
);

// メンバー追加(ユーザー名で検索)
router.post(
  '/groups/:id/members',
  wrap(async (req, res) => {
    const groupId = Number(req.params.id);
    const group = await loadGroupForMember(groupId, req.session.userId);
    if (!group) return res.redirect('/groups');

    const name = (req.body.name || '').trim();
    const user = await prisma.user.findUnique({ where: { name } });
    if (!user) {
      return res.redirect(
        `/groups/${groupId}?error=${encodeURIComponent(`ユーザー「${name}」が見つかりません`)}`
      );
    }
    if (!group.members.some((m) => m.userId === user.id)) {
      await prisma.groupMember.create({
        data: { groupId, userId: user.id, weight: 1.0 },
      });
    }
    res.redirect(`/groups/${groupId}`);
  })
);

// 傾斜割り勘: weight の更新(均等 / 職業プリセット / 手動比率)(Should 7)
router.post(
  '/groups/:id/weights',
  wrap(async (req, res) => {
    const groupId = Number(req.params.id);
    const group = await loadGroupForMember(groupId, req.session.userId);
    if (!group) return res.redirect('/groups');

    const preset = req.body.preset;
    for (const m of group.members) {
      let weight;
      if (preset === 'equal') {
        weight = 1.0;
      } else if (preset === 'occupation') {
        weight = OCCUPATION_PRESET[m.user.occupation] ?? 1.0;
      } else {
        weight = Number(req.body[`weight_${m.userId}`]);
      }
      if (!Number.isFinite(weight) || weight <= 0) continue;
      await prisma.groupMember.update({
        where: { groupId_userId: { groupId, userId: m.userId } },
        data: { weight },
      });
    }
    res.redirect(`/groups/${groupId}`);
  })
);

module.exports = router;
