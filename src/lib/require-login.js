// 認証ガード: 未ログインならログイン画面へ
module.exports = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};
