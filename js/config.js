/* ============================================================
 * config.js — Firebase初期化 + アプリ全体の共有状態
 *
 * C言語で言うと「グローバル変数の宣言ヘッダ + 初期化処理」に相当する。
 * auth（認証）, db（データベース）インスタンスをここで生成し、
 * 他の全モジュールはこのファイルからインポートして使う。
 * state オブジェクトは C の構造体グローバル変数のように、
 * 全モジュールが書き換えることで状態を共有する。
 * ============================================================ */

import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* 管理者のUID — ⚙️設定モーダルの「コピー」ボタンで確認できる */
export const ADMIN_UID = 'VqV9qx9rgec1QyrUhg76OLDqThG3';

const firebaseConfig = {
    apiKey:            "AIzaSyDaEcfyRN0DjWi27zX4AOoNms8pAdl0OqY",
    authDomain:        "tekazashi-app.firebaseapp.com",
    projectId:         "tekazashi-app",
    storageBucket:     "tekazashi-app.firebasestorage.app",
    messagingSenderId: "381277813213",
    appId:             "1:381277813213:web:034ba91d3a8ceb46e11e34"
};

export const app      = initializeApp(firebaseConfig);
export const auth     = getAuth(app);
export const db       = getFirestore(app);
export const provider = new GoogleAuthProvider();

/* アプリ全体の共有状態オブジェクト（C の struct AppState に相当）
 * 各モジュールは state.records.push(...) のように直接書き換える */
export const state = {
    currentUser:          null,
    records:              [],   /* 施光記録リスト */
    receiveRecords:       [],   /* 受光記録リスト */
    personMemos:          [],   /* 人別メモリスト */
    announcementData:     null,
    currentCalendarDate:  new Date(),
    duplicateInfo:        null,
    editingRecord:        null,
    editingReceiveRecord: null,
    editingMemo:          null,
    calFilter:            { mikunite: false, time10: false, type8: false, type7: false, type6: false, type1: false },
    calMode:              'give'
};

/* 施光種類ごとの標準時間（分）— チェック時に自動セットされる */
export const typeTimeMap        = { 'type-8': 10, 'type-7': 6, 'type-6': 6, 'type-1': 10 };
export const receiveTypeTimeMap = { 'receive-type-8': 10, 'receive-type-7': 6, 'receive-type-6': 6, 'receive-type-1': 10 };
