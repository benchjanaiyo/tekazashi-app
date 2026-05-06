# 手かざし記録アプリ — Claude向けインデックス

## アプリ概要
Firebase（Firestore + Google Auth）を使ったPWA。
約10人の友人がGoogleアカウントでログインして施光・受光を記録する。
GitHub Pages でホスティング：https://benchjanaiyo.github.io/tekazashi-app/tekazashi-app.html

## ファイル構成

| ファイル | 役割 |
|---|---|
| `tekazashi-app.html` | HTMLのみ。CSS/JSを読み込む入口 |
| `css/style.css` | 全スタイル |
| `js/main.js` | エントリーポイント。onAuthStateChanged・DOMContentLoaded登録 |
| `js/config.js` | Firebase初期化・ADMIN_UID・共有状態(state)オブジェクト |
| `js/utils.js` | 純粋なヘルパー関数（escapeHtml, getToday, showLoading等） |
| `js/auth.js` | Googleログイン・ログアウト |
| `js/records.js` | 施光記録のCRUD + 今日の記録表示 + 人チップ |
| `js/receive.js` | 受光記録のCRUD + 今日の記録表示 + 人名サジェスト |
| `js/memos.js` | 人別メモの追加・編集・削除 |
| `js/calendar.js` | 月別カレンダー（月曜始まり）+ フィルター |
| `js/stats.js` | 人別/月別統計 + 管理者専用メンバー利用状況 |
| `js/announcement.js` | お知らせバナー + おしらせタブ本文 |
| `js/data.js` | CSVエクスポート・インポート（⚙️設定モーダルから） |
| `js/ui.js` | タブ切り替え・スワイプ・モーダル・サジェスト |
| `manifest.json` | PWAマニフェスト（Android/iPhone ホーム画面追加用） |
| `push.bat` | git add -A && commit && push origin test を一発実行 |

## 重要な定数・設定

- **管理者UID**: `js/config.js` の `ADMIN_UID`
- **Firestoreプロジェクト**: `tekazashi-app`
- **デプロイ先**: `test` ブランチ → PR承認 → `main` ブランチ

## Firestoreコレクション

| コレクション | 内容 | アクセス権限 |
|---|---|---|
| `records` | 施光記録 | 本人のみ読み書き |
| `receiveRecords` | 受光記録 | 本人のみ読み書き |
| `personMemos` | 人別メモ | 本人のみ読み書き |
| `settings` | お知らせ設定 | 全員読み・管理者のみ書き |
| `usageLogs` | メンバー利用状況 | 管理者のみ読み・本人書き |

## 共有状態の仕組み

`js/config.js` の `state` オブジェクトを全モジュールがインポートして直接書き換える。
```js
// 例: records.js での使い方
import { state } from './config.js';
state.records.push(newRecord); // 書き換えると他のモジュールにも反映される
```

## モジュール間の呼び出し規則

- 循環インポートを避けるため、モジュール間の呼び出しは `window.xxx()` 経由
- 例: `records.js` から `updateCalendar` を呼ぶときは `window.updateCalendar()`
- `state`・`firebase.js`・`utils.js` は他モジュールに依存しないため直接インポートOK

## タブ構成

`js/ui.js` の `TAB_ORDER = ['give', 'receive', 'calendar', 'stats', 'data']`
- `data` タブはラベルが「おしらせ」（IDはdataのまま）

## GitHubへのプッシュ方法

`push.bat` をダブルクリックすると `test` ブランチへ自動プッシュされる。
その後、GitHub上でtestからmainへのPRを承認する。

Claude Codeからは `git add -A && git commit -m "..." && git push origin test --force` で実行可能。
