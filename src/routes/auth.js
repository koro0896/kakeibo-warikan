// ユーザー登録 / ログイン / ログアウト(Must 1)
const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const wrap = require('../lib/wrap');

const router = express.Router();

const GRADES = ['1年', '2年', '3年', '4年', '修士1年', '修士2年', 'その他'];
const OCCUPATIONS = ['高校生', '大学生', '大学院生', '社会人', 'その他'];

router.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { title: 'ログイン', error: null });
});

router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register', {
    title: 'ユーザー登録',
    error: null,
    grades: GRADES,
    occupations: OCCUPATIONS,
    values: {},
  });
});

router.post(
  '/register',
  wrap(async (req, res) => {
    const name = (req.body.name || '').trim();
    const grade = (req.body.grade || '').trim();
    const occupation = (req.body.occupation || '').trim();
    const password = req.body.password || '';

    const renderError = (error) =>
      res.status(400).render('register', {
        title: 'ユーザー登録',
        error,
        grades: GRADES,
        occupations: OCCUPATIONS,
        values: { name, grade, occupation },
      });

    if (!name) return renderError('名前を入力してください');
    if (password.length < 4) return renderError('パスワードは4文字以上にしてください');

    const existing = await prisma.user.findUnique({ where: { name } });
    if (existing) return renderError('その名前は既に使われています');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, grade, occupation, passwordHash },
    });
    req.session.userId = user.id;
    res.redirect('/dashboard');
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const name = (req.body.name || '').trim();
    const password = req.body.password || '';
    const user = await prisma.user.findUnique({ where: { name } });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) {
      return res
        .status(401)
        .render('login', { title: 'ログイン', error: '名前またはパスワードが違います' });
    }
    req.session.userId = user.id;
    res.redirect('/dashboard');
  })
);

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

module.exports = router;
