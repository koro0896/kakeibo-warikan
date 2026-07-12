// Express エントリポイント(古典的MPA: フォームPOST → リダイレクト → GET)
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const prisma = require('./lib/prisma');
const requireLogin = require('./lib/require-login');
const { formatDate, toInputDate } = require('./lib/date');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// 全ビューで使えるヘルパー
app.locals.formatDate = formatDate;
app.locals.toInputDate = toInputDate;
app.locals.yen = (n) => `¥${Number(n).toLocaleString('ja-JP')}`;

app.use(express.urlencoded({ extended: true })); // フォームPOSTの受け取り
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.SESSION_KEY || 'dev-key'],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7日
  })
);

// ログイン中ユーザーを全ビューから参照できるようにする
app.use(async (req, res, next) => {
  res.locals.currentUser = null;
  try {
    if (req.session.userId) {
      res.locals.currentUser = await prisma.user.findUnique({
        where: { id: req.session.userId },
      });
      if (!res.locals.currentUser) req.session = null; // 消えたユーザーのセッションは破棄
    }
    next();
  } catch (err) {
    next(err);
  }
});

// 認証不要ルート
app.use(require('./routes/auth'));

// これ以降は要ログイン
app.use(requireLogin);
app.use(require('./routes/dashboard'));
app.use(require('./routes/expenses'));
app.use(require('./routes/groups'));

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: 'Not Found', message: 'ページが見つかりません' });
});

// エラーハンドラ
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'エラー',
    message: 'サーバーエラーが発生しました。時間をおいて再度お試しください。',
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`家計簿×割り勘: http://localhost:${port}`);
});
