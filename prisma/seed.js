// デモ用シードデータ。
// ⚠️ Render 無料プランはディスク非永続 → 起動時に必ず seed してデモを再現する前提。
// 何度実行しても壊れないよう upsert / 存在チェックで冪等にしてある。
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

// [カテゴリ名, 客観区分(必需=true)]
const CATEGORIES = [
  ['食費', true],
  ['日用品', true],
  ['住居・光熱', true],
  ['交通費', true],
  ['通信費', true],
  ['医療・保険', true],
  ['教育・書籍', true],
  ['趣味・娯楽', false],
  ['交際費', false],
  ['衣服・美容', false],
  ['その他', false],
];

// 分類辞書の初期語彙(カテゴリ名 → 単語リスト)
const KEYWORDS = {
  食費: ['コーラ', 'ジュース', 'コーヒー', 'カフェ', 'ランチ', '昼食', '夕食', '朝食', '弁当', 'パン', 'おにぎり', 'スーパー', 'コンビニ', '学食', '外食', 'お菓子', 'ラーメン', '牛丼', '定食', '食材', '米', '飲み物'],
  日用品: ['洗剤', 'シャンプー', 'ティッシュ', 'トイレットペーパー', '歯磨き', '日用品', 'ドラッグストア', '電池'],
  '住居・光熱': ['家賃', '電気代', 'ガス代', '水道代', '光熱費'],
  交通費: ['電車', 'バス', 'タクシー', '定期', '切符', '交通費', 'ガソリン', '新幹線'],
  通信費: ['スマホ代', '携帯代', '通信費', 'ネット代', 'Wi-Fi'],
  '医療・保険': ['病院', '薬', '診察', '保険料'],
  '教育・書籍': ['本', '書籍', '参考書', '教科書', '資格', '講座'],
  '趣味・娯楽': ['映画', 'ゲーム', 'カラオケ', 'ライブ', '漫画', 'サブスク', 'Netflix', 'Spotify'],
  交際費: ['飲み会', 'プレゼント', 'デート', 'お土産', '歓迎会', '送別会', 'BBQ'],
  '衣服・美容': ['服', '靴', '美容院', '散髪', '化粧品', 'コスメ'],
};

const DEMO_USERS = [
  { name: 'たろう', grade: '3年', occupation: '大学生' },
  { name: 'はなこ', grade: '2年', occupation: '大学生' },
  { name: 'けんじ', grade: '', occupation: '社会人' },
];
const DEMO_PASSWORD = 'pass1234';

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  // 1. カテゴリ
  const catId = {};
  for (const [name, essential] of CATEGORIES) {
    const c = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, defaultIsEssential: essential },
    });
    catId[name] = c.id;
  }

  // 2. 分類辞書
  for (const [catName, words] of Object.entries(KEYWORDS)) {
    for (const word of words) {
      await prisma.keyword.upsert({
        where: { word },
        update: {},
        create: { word, categoryId: catId[catName] },
      });
    }
  }

  // 3. デモユーザー(パスワードは全員 pass1234)
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = {};
  for (const u of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { name: u.name },
      update: {},
      create: { ...u, passwordHash },
    });
    users[u.name] = user;
  }

  // 4. デモ支出・グループ(既にあれば作らない)
  const expenseCount = await prisma.expense.count();
  if (expenseCount === 0) {
    const now = new Date();
    const day = (offset) =>
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const taro = users['たろう'].id;
    const hanako = users['はなこ'].id;
    const kenji = users['けんじ'].id;

    // 個人支出(今月)
    const personal = [
      [taro, 120, '食費', true, '今日コーラ(120円)買った', 0],
      [taro, 850, '食費', true, '学食でランチ 850円', -1],
      [taro, 560, '交通費', true, '電車代 560円', -2],
      [taro, 1500, '趣味・娯楽', false, '映画 1500円', -3],
      [taro, 3200, '教育・書籍', true, '参考書 3200円', -5],
      [hanako, 780, '食費', true, 'コンビニ弁当と飲み物 780円', -1],
      [hanako, 2900, '衣服・美容', false, '服 2900円', -4],
    ];
    // 先月の支出(先月比較のデモ用)
    const lastMonth = [
      [taro, 4200, '食費', true, '先月の外食', -32],
      [taro, 1200, '交通費', true, '先月の電車代', -33],
      [taro, 4800, '趣味・娯楽', false, '先月のライブ', -35],
    ];
    for (const [userId, amount, cat, ess, memo, offset] of [...personal, ...lastMonth]) {
      await prisma.expense.create({
        data: {
          userId,
          amount,
          categoryId: catId[cat],
          isEssential: ess,
          memo,
          spentAt: day(offset),
        },
      });
    }

    // グループ+割り勘つき支出
    const group = await prisma.group.create({
      data: {
        name: '夏合宿',
        members: {
          create: [
            { userId: taro, weight: 1.0 },
            { userId: hanako, weight: 1.0 },
            { userId: kenji, weight: 1.0 },
          ],
        },
      },
    });
    const groupExpenses = [
      // [支払者, 金額, カテゴリ, memo, 参加者]
      [taro, 6000, '食費', 'BBQ食材 6000円', [taro, hanako, kenji]],
      [kenji, 9000, '交通費', 'レンタカー 9000円', [taro, hanako, kenji]],
      [hanako, 2400, '食費', '朝食の買い出し 2400円', [taro, hanako]],
    ];
    for (const [payer, amount, cat, memo, members] of groupExpenses) {
      await prisma.expense.create({
        data: {
          userId: payer,
          groupId: group.id,
          amount,
          categoryId: catId[cat],
          isEssential: true,
          memo,
          spentAt: day(-1),
          participants: { create: members.map((id) => ({ userId: id })) },
        },
      });
    }

    // 今月の予算(たろう)
    await prisma.budget.upsert({
      where: { userId_month: { userId: taro, month: monthKey(now) } },
      update: {},
      create: { userId: taro, month: monthKey(now), amount: 30000 },
    });
  }

  console.log('✅ seed 完了(デモユーザー: たろう / はなこ / けんじ、パスワード: pass1234)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
