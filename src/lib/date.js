// 日付まわりの小さなヘルパー(純関数)

// 予算テーブルのキーに使う "YYYY-MM"
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// その月の [1日0時, 翌月1日0時) の範囲
function monthRange(d) {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
  };
}

// 表示用 "2026/7/12"
function formatDate(d) {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// <input type="date"> 用 "2026-07-12"
function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

module.exports = { monthKey, monthRange, formatDate, toInputDate };
