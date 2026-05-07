/* ============================================================
 * main.js — アプリのエントリーポイント
 *
 * C言語の main() 関数に相当する。
 * 全モジュールをインポートし、DOMContentLoaded と
 * onAuthStateChanged（ログイン状態変化）の登録を行う。
 * 他のモジュールはここで確実に読み込まれる。
 * ============================================================ */

import { auth, db, ADMIN_UID, state }             from './config.js';
import { setTodayDate, showLoading, getToday }    from './utils.js';
import { loadAnnouncement, renderBanner }          from './announcement.js';
import { updateRecentPeople }                      from './records.js';
import { setupReceivePersonSuggest }               from './receive.js';
import { setupSwipe, setupLocationSuggestion,
         setupGiveNameSuggest }                    from './ui.js';

/* 各機能モジュールを副作用のために読み込む（window.xxx が登録される） */
import './auth.js';
import './records.js';
import './receive.js';
import './memos.js';
import './calendar.js';
import './stats.js';
import './data.js';
import './announcement.js';
import './ui.js';

import { onAuthStateChanged }                      from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs,
         orderBy, doc, setDoc, increment }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===================== 認証状態の変化を監視 ===================== */

onAuthStateChanged(auth, async user => {
    state.currentUser = user;
    if (user) {
        /* ログイン後: UIを更新してデータを読み込む */
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('user-name').textContent = user.displayName || user.email;
        document.getElementById('user-avatar').src = user.photoURL || '';
        document.getElementById('user-avatar').classList.toggle('hidden', !user.photoURL);
        document.getElementById('uid-display').textContent = user.uid;

        await loadAllData();
        setTodayDate();       /* 先に日付をセットしてから */
        window.updateDisplay(); /* 表示を更新する（順番重要） */
        window.loadUserSubtitle && window.loadUserSubtitle(); /* サブタイトルを読み込む */
        window.showView('give', false);
        updateUsageLog();
    } else {
        /* ログアウト後: ログイン画面に戻す */
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
        state.records = [];
        state.receiveRecords = [];
        state.personMemos = [];
    }
});

/* ===================== 全データの読み込み ===================== */

/* Promise.all で施光・受光・メモ・お知らせを並列取得する */
async function loadAllData() {
    showLoading(true);
    try {
        const [giveSnap, receiveSnap, memoSnap] = await Promise.all([
            getDocs(query(collection(db, 'records'),
                where('uid', '==', state.currentUser.uid), orderBy('date', 'desc'))),
            getDocs(query(collection(db, 'receiveRecords'),
                where('uid', '==', state.currentUser.uid), orderBy('date', 'desc'))),
            getDocs(query(collection(db, 'personMemos'),
                where('uid', '==', state.currentUser.uid), orderBy('memoDate', 'desc'))),
            loadAnnouncement()
        ]);
        state.records       = giveSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        state.receiveRecords = receiveSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        state.personMemos   = memoSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    } catch (e) {
        console.error(e);
        alert('データの読み込みに失敗しました。\n' + e.message);
    }
    showLoading(false);
}

/* ===================== 利用状況ログの更新 ===================== */

/* increment() で読み取りなしに loginCount をインクリメントする
 * （一般ユーザーは usageLogs の読み取り権限がないため、setDoc+increment を使用） */
async function updateUsageLog() {
    try {
        const logRef = doc(db, 'usageLogs', state.currentUser.uid);
        await setDoc(logRef, {
            name:         state.currentUser.displayName || state.currentUser.email,
            email:        state.currentUser.email,
            lastLogin:    getToday(),
            loginCount:   increment(1),
            recordCount:  state.records.length,
            receiveCount: state.receiveRecords.length,
            updatedAt:    new Date().toISOString()
        }, { merge: true });
    } catch (e) { /* ログ更新失敗は無視 */ }
}

/* ===================== 表示全体更新 ===================== */

/* C言語の「再描画関数」に相当。データ変化後に必ず呼ばれる。 */
window.updateDisplay = function () {
    window.updateStats && window.updateStats();
    updateRecentPeople();
    window.updateRecentPeopleGlobal = updateRecentPeople; /* memos.js から呼べるよう登録 */
    window.updateTodaysGiveRecords    && window.updateTodaysGiveRecords();
    window.updateTodaysReceiveRecords && window.updateTodaysReceiveRecords();
    if (window._refreshReceivePersonSuggest) window._refreshReceivePersonSuggest();
};

/* ===================== DOMContentLoaded 初期化 ===================== */

document.addEventListener('DOMContentLoaded', () => {
    /* チェックボックス変更で時間を自動計算 */
    ['type-8', 'type-7', 'type-6', 'type-1'].forEach(id =>
        document.getElementById(id).addEventListener('change', window.updatePlayTime));
    ['receive-type-8', 'receive-type-7', 'receive-type-6', 'receive-type-1'].forEach(id =>
        document.getElementById(id).addEventListener('change', window.updateReceiveTime));
    ['edit-type-8', 'edit-type-7', 'edit-type-6', 'edit-type-1'].forEach(id =>
        document.getElementById(id).addEventListener('change', window.updateEditPlayTime));

    /* 日付変更で当日記録を更新 */
    document.getElementById('selected-date').addEventListener('change', window.updateTodaysGiveRecords);
    document.getElementById('receive-selected-date').addEventListener('change', window.updateTodaysReceiveRecords);

    /* Enterキーで施光追加 */
    document.getElementById('person-name').addEventListener('keypress', e => {
        if (e.key === 'Enter') window.addNewPerson();
    });

    /* Escape/オーバーレイクリックでモーダルを閉じる */
    document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeAllModals(); });
    document.addEventListener('click',   e => {
        if (e.target.classList.contains('modal-overlay')) window.closeAllModals();
    });

    /* サジェスト・スワイプの初期化 */
    setupLocationSuggestion('location', 'location-suggest');
    setupLocationSuggestion('receive-location', 'receive-location-suggest');
    setupReceivePersonSuggest();
    setupSwipe();
    setupGiveNameSuggest();
});
