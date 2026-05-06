/* ============================================================
 * auth.js — Google認証
 *
 * C言語のログイン処理モジュールに相当する。
 * ログイン・ログアウトの関数を window に公開する。
 * onAuthStateChanged の登録は main.js が行う。
 * ============================================================ */

import { auth, provider }             from './config.js';
import { signInWithPopup, signOut }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* Googleポップアップでサインイン */
window.signInWithGoogle = async function () {
    try { await signInWithPopup(auth, provider); }
    catch (e) { alert('ログインに失敗しました: ' + e.message); }
};

/* サインアウト（確認ダイアログ付き） */
window.signOutUser = async function () {
    if (confirm('ログアウトしますか？')) await signOut(auth);
};
