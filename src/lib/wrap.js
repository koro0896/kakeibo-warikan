// async なルートハンドラのエラーを Express のエラーハンドラに流すラッパー
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
