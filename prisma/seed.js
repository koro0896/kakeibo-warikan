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

    // 今月の予算(たろう): 生活必需 20,000円 + 嗜好品 10,000円(合計は自動計算で 30,000円)
    await prisma.budget.upsert({
      where: { userId_month: { userId: taro, month: monthKey(now) } },
      update: {},
      create: {
        userId: taro,
        month: monthKey(now),
        essentialAmount: 20000,
        optionalAmount: 10000,
      },
    });
  }

  // 5. KOROユーザー(本人が引き継いで使うアカウント)+ 直近5ヶ月の支出データ
  const now2 = new Date();
  const koro = await prisma.user.upsert({
    where: { name: 'KORO' },
    update: {},
    create: { name: 'KORO', grade: '4年', occupation: '大学生', passwordHash },
  });

  const koroExpenseCount = await prisma.expense.count({ where: { userId: koro.id } });
  if (koroExpenseCount === 0) {
    // 月ごとの支出パターン。配列のインデックス = 何ヶ月前か(0 = 今月)
    // [日, 金額, カテゴリ, 必需?, メモ]
    const KORO_MONTHS = [
      [
        // 今月
        [1, 1200, '日用品', true, '洗剤とティッシュ(1200円)'],
        [2, 850, '食費', true, '学食でランチ 850円'],
        [4, 560, '交通費', true, '電車代 560円'],
        [5, 1980, '通信費', true, 'スマホ代 1980円'],
        [6, 1500, '趣味・娯楽', false, '映画(1500円)'],
        [8, 2400, '食費', true, 'スーパーで食材 2400円'],
        [10, 3200, '交際費', false, '飲み会 3200円'],
        [12, 480, '食費', false, 'カフェ 480円'],
      ],
      [
        // 1ヶ月前
        [3, 2600, '食費', true, 'スーパーで食材 2600円'],
        [5, 1980, '通信費', true, 'スマホ代 1980円'],
        [7, 1100, '日用品', true, 'シャンプーと歯磨き粉 1100円'],
        [9, 860, '交通費', true, '電車代 860円'],
        [12, 3400, '衣服・美容', false, 'Tシャツ 3400円'],
        [15, 2200, '食費', true, 'スーパーで食材 2200円'],
        [18, 1500, '趣味・娯楽', false, 'カラオケ 1500円'],
        [21, 2800, '交際費', false, '飲み会 2800円'],
        [24, 900, '食費', false, 'スイーツ食べ歩き 900円'],
        [27, 1300, '教育・書籍', true, '参考書 1300円'],
      ],
      [
        // 2ヶ月前
        [2, 2400, '食費', true, 'スーパーで食材 2400円'],
        [5, 1980, '通信費', true, 'スマホ代 1980円'],
        [8, 1500, '医療・保険', true, '皮膚科の診察 1500円'],
        [10, 720, '交通費', true, 'バス代 720円'],
        [14, 4200, '趣味・娯楽', false, 'ゲームソフト 4200円'],
        [17, 2100, '食費', true, 'スーパーで食材 2100円'],
        [20, 1800, '交際費', false, 'カラオケ 1800円'],
        [25, 1000, '日用品', true, 'ドラッグストア 1000円'],
        [28, 1600, '衣服・美容', false, '散髪 1600円'],
      ],
      [
        // 3ヶ月前
        [1, 3000, '教育・書籍', true, '新学期の教科書 3000円'],
        [4, 1980, '通信費', true, 'スマホ代 1980円'],
        [6, 2500, '食費', true, 'スーパーで食材 2500円'],
        [9, 5000, '交通費', true, '定期券の更新 5000円'],
        [13, 2000, '交際費', false, '新歓 2000円'],
        [16, 1900, '食費', true, 'スーパーで食材 1900円'],
        [19, 2600, '趣味・娯楽', false, '映画とゲームセンター 2600円'],
        [23, 800, '日用品', true, 'ティッシュと電池 800円'],
        [26, 1200, '食費', false, 'タピオカとお菓子 1200円'],
      ],
      [
        // 4ヶ月前
        [2, 2300, '食費', true, 'スーパーで食材 2300円'],
        [5, 1980, '通信費', true, 'スマホ代 1980円'],
        [8, 950, '日用品', true, '洗剤 950円'],
        [11, 680, '交通費', true, '電車代 680円'],
        [14, 3500, '交際費', false, '追いコン 3500円'],
        [18, 2000, '食費', true, 'スーパーで食材 2000円'],
        [22, 2980, '趣味・娯楽', false, '漫画まとめ買い 2980円'],
        [26, 1400, '衣服・美容', false, '古着 1400円'],
      ],
    ];

    for (let offset = 0; offset < KORO_MONTHS.length; offset++) {
      for (const [dayOfMonth, amount, cat, ess, memo] of KORO_MONTHS[offset]) {
        const spentAt = new Date(now2.getFullYear(), now2.getMonth() - offset, dayOfMonth);
        if (spentAt > now2) continue; // 今月の未来日はスキップ
        await prisma.expense.create({
          data: {
            userId: koro.id,
            amount,
            categoryId: catId[cat],
            isEssential: ess,
            memo,
            spentAt,
          },
        });
      }
    }

    // 今月の予算: 生活必需 10,000円 + 嗜好品 10,000円(合計は自動計算で 20,000円)
    await prisma.budget.upsert({
      where: { userId_month: { userId: koro.id, month: monthKey(now2) } },
      update: { essentialAmount: 10000, optionalAmount: 10000 },
      create: {
        userId: koro.id,
        month: monthKey(now2),
        essentialAmount: 10000,
        optionalAmount: 10000,
      },
    });
  }

  console.log('✅ seed 完了(デモユーザー: たろう / はなこ / けんじ / KORO、パスワード: pass1234)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
