/* ============================================================
 * auth.js — Google認証
 *
 * C言語のログイン処理モジュールに相当する。
 * ログイン・ログアウトの関数を window に公開する。
 * onAuthStateChanged の登録は main.js が行う。
 * ============================================================ */

import { auth, provider }                                    from './config.js';
import { signInWithPopup, signInWithRedirect,
         getRedirectResult, signOut }                         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* iOSホーム画面追加（standalone PWA）か判定する
 * iOSのstandalone PWAではポップアップが正しく扱えず signInWithPopup が
 * auth/internal-error を返すため、redirect 方式に切り替える。 */
function isStandalonePWA() {
    return window.navigator.standalone === true ||
           window.matchMedia('(display-mode: standalone)').matches;
}

/* Googleでサインイン
 * - 通常のブラウザ：popup（ユーザー体験が良い）
 * - standalone PWA：redirect（iOSでpopupが効かないため） */
window.signInWithGoogle = async function () {
    try {
        if (isStandalonePWA()) {
            await signInWithRedirect(auth, provider);
        } else {
            await signInWithPopup(auth, provider);
        }
    } catch (e) {
        alert('ログインに失敗しました: ' + e.message);
    }
};

/* リダイレクト復帰時のエラーを表面化させる
 * 成功時は onAuthStateChanged が自動で発火するので、ここではエラーのみ処理 */
getRedirectResult(auth).catch(e => {
    if (e && e.code) alert('ログインに失敗しました: ' + e.message);
});

/* サインアウト（確認ダイアログ付き） */
window.signOutUser = async function () {
    if (confirm('ログアウトしますか？')) await signOut(auth);
};
