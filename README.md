# 家計簿×割り勘 Webアプリ

「実践のためのWebプログラミング」最終課題。
個人家計簿を基盤に、割り勘をグループ機能として乗せた二段構えのWebアプリです。

- 構成: **Express + EJS(サーバーサイドレンダリングMPA)+ Prisma(SQLite)+ cookie-session**
- fetch / SPA は不使用。フォームPOST → リダイレクト → GET(PRGパターン)で全画面が動きます
- 対応ブラウザ: PC版のみ(講義方針どおりレスポンシブ非対応)

## 機能一覧(要件メモ v2 との対応)

### Must(すべて実装済み)

1. **ユーザー登録+セッションログイン** — 名前・学年・職業・パスワード(bcryptハッシュ)。cookie-session使用
2. **テキスト入力による支出登録** — 「今日コーラ(120円)買った」→ 正規表現+キーワード辞書で金額・日付・カテゴリを解析 → 確認画面で修正して確定(2画面フロー)
3. **支出一覧** — いつ・何に・いくら・誰が。編集/削除つき
4. **カテゴリ別円グラフ** — 当月の支出割合(Chart.js CDN)。必需/嗜好の内訳ドーナツも
5. **割り勘** — グループ作成 → 支出に参加者を記録 → 均等割りで精算額を計算・表示

### Should(実装済み)

6. **月次予算** — 自己申告予算+消化率バー。80%で警告、100%で超過アラート
7. **傾斜割り勘** — 手動比率(weight編集)+職業プリセット(社会人1.5 / 大学院生1.2 / 大学生1.0 / 高校生0.8)
8. **先月比較** — カテゴリ別の今月/先月/増減テーブル

### Could(実装済み)

9. **分類辞書の自己成長** — 確認画面でカテゴリを手修正すると、品目の単語→カテゴリ対応が keywords テーブルに自動登録され、次回から正しく分類される
10. **送金回数最小化** — 貸借を相殺し、貪欲法で送金案を作成

### 設計上のポイント

- テキスト解析(`src/lib/parse.js`)と割り勘計算(`src/lib/split.js`)は **DBに触らない純関数**として分離し、`node --test` でユニットテスト済み(12ケース)
- リレーション取得は Prisma の `include`、集計は `groupBy` を使用(**N+1問題を回避**)
- 必需/嗜好は `categories.default_is_essential`(客観)+ `expenses.is_essential`(主観上書き)の二層

## セットアップ

Node.js v20 以上が必要です。

```bash
npm install
npx prisma migrate dev --name init   # DB作成(prisma/dev.db)
npm run db:seed                      # デモデータ投入
npm run dev                          # http://localhost:3000
```

### デモアカウント(seed 投入後)

| 名前 | パスワード | 備考 |
|---|---|---|
| たろう | pass1234 | 個人支出・予算30,000円・グループ「夏合宿」 |
| はなこ | pass1234 | 「夏合宿」メンバー |
| けんじ | pass1234 | 社会人(職業プリセットのデモ用) |

### テスト

```bash
npm test   # node --test でコアロジック(解析・割り勘)のテストを実行
```

## デモ動線(発表用)

1. 「たろう / pass1234」でログイン → ダッシュボード(円グラフ・予算バー・先月比較)
2. 「支出を記録」→ `今日タピオカ 500円 買った` → カテゴリを「食費」に手修正して確定
   → もう一度 `タピオカ 300円` と入力すると今度は自動で「食費」になる(**辞書の自己成長**)
3. グループ「夏合宿」を開く → 精算表と送金案 → 「職業プリセット」を押すと社会人のけんじの負担が増える(**傾斜割り勘**)

## Render へのデプロイ

- Build Command: `npm install && npx prisma migrate deploy`
- Start Command: `npm run db:seed && npm start`
- 環境変数: `SESSION_KEY` にランダムな文字列、`DATABASE_URL` に `file:./dev.db`

⚠️ Render 無料プランはディスク非永続のため、SQLite のデータは再起動で消えます。
そのため**起動時に必ず seed を実行**してデモデータを再現する構成にしています(seed は何度実行しても壊れない冪等な作りです)。

## ディレクトリ構成

```
├─ prisma/
│   ├─ schema.prisma        # DBスキーマ(8テーブル)
│   └─ seed.js              # デモ用シードデータ(冪等)
├─ src/
│   ├─ server.js            # Expressエントリポイント
│   ├─ routes/
│   │   ├─ auth.js          # 登録/ログイン/ログアウト
│   │   ├─ expenses.js      # 支出の解析→確認→確定・一覧・編集・削除
│   │   ├─ dashboard.js     # 円グラフ集計・予算・先月比較
│   │   └─ groups.js        # グループ・メンバー・weight・精算
│   └─ lib/
│       ├─ parse.js         # テキスト解析(純関数)
│       ├─ split.js         # 割り勘計算(純関数)
│       ├─ parse.test.js / split.test.js
│       ├─ date.js / prisma.js / wrap.js / require-login.js
├─ views/                   # EJSテンプレート(partials/header, footer 共通)
└─ public/style.css         # destyle.css(CDN)の上に載せる自前CSS
```
