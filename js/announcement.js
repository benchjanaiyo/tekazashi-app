/* ============================================================
 * announcement.js — お知らせバナー + おしらせタブ
 *
 * Firestoreの settings/announcement ドキュメントを読み書きする。
 * ・message + active フィールド → 画面上部のバナー
 * ・noticeContent フィールド   → おしらせタブの本文
 * 管理者のみ編集ボタンが表示される。
 * ============================================================ */

import { db, ADMIN_UID, state } from './config.js';
import { showLoading }          from './utils.js';
import { doc, getDoc, setDoc }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* Firestoreからお知らせデータを読み込んでバナーを更新する */
export async function loadAnnouncement() {
    try {
        const snap = await getDoc(doc(db, 'settings', 'announcement'));
        if (snap.exists()) state.announcementData = snap.data();
    } catch (e) { console.warn('お知らせ取得に失敗:', e); /* バナーなしで続行 */ }
    renderBanner();
}

/* dismiss判定用に、メッセージ内容のフィンガープリントを生成 */
function bannerFingerprint(msg) {
    return 'announcementDismissed_' + (msg || '').slice(0, 100);
}

/* バナーとおしらせタブ表示を state.announcementData から再描画する */
export function renderBanner() {
    const banner   = document.getElementById('announcement-banner');
    const isAdmin  = state.currentUser?.uid === ADMIN_UID;
    const hasActive = state.announcementData?.active && state.announcementData?.message;

    /* 同じメッセージを過去に「×」で閉じていたら再表示しない（管理者は除く） */
    const dismissed = hasActive && !isAdmin &&
        localStorage.getItem(bannerFingerprint(state.announcementData.message)) === '1';

    if ((!hasActive && !isAdmin) || dismissed) {
        banner.classList.add('hidden');
    } else {
        const msgEl = document.getElementById('banner-message');
        if (hasActive) {
            msgEl.textContent  = state.announcementData.message;
            msgEl.style.opacity = '1';
        } else {
            msgEl.textContent  = '（お知らせ未設定）✏️ボタンから投稿できます';
            msgEl.style.opacity = '0.6';
        }
        banner.classList.remove('hidden');
        const adminBtn = document.getElementById('banner-admin-btn');
        if (adminBtn) adminBtn.classList.toggle('hidden', !isAdmin);
    }

    /* おしらせタブ本文の同期（noticeContent フィールドを使用） */
    const noticeMsg = document.getElementById('notice-message-display');
    if (noticeMsg) {
        const content = state.announcementData?.noticeContent;
        if (content) {
            noticeMsg.textContent = content;
            noticeMsg.classList.remove('notice-empty');
        } else {
            noticeMsg.textContent = 'お知らせはありません';
            noticeMsg.classList.add('notice-empty');
        }
    }
    const noticeAdmin = document.getElementById('notice-admin-area');
    if (noticeAdmin) noticeAdmin.classList.toggle('hidden', !isAdmin);
}

/* バナーを閉じる（非表示にするだけ、Firestore側のデータは消さない）
 * 同じメッセージは localStorage で既読扱いにし、リロード後も再表示しない */
window.dismissBanner = function () {
    document.getElementById('announcement-banner').classList.add('hidden');
    const msg = state.announcementData?.message;
    if (msg) localStorage.setItem(bannerFingerprint(msg), '1');
};

/* バナー編集モーダルを開く（管理者専用） */
window.openAnnouncementEditor = function () {
    document.getElementById('ann-message-input').value  = state.announcementData?.message || '';
    document.getElementById('ann-active-input').checked = state.announcementData?.active !== false;
    window.openModal('announcement-modal');
};

/* バナーメッセージを保存する */
window.saveAnnouncement = async function () {
    const message = document.getElementById('ann-message-input').value.trim();
    const active  = document.getElementById('ann-active-input').checked;
    showLoading(true);
    try {
        await setDoc(doc(db, 'settings', 'announcement'), { ...state.announcementData, message, active });
        state.announcementData = { ...state.announcementData, message, active };
        renderBanner();
        window.closeAllModals();
    } catch (e) { alert('保存に失敗しました: ' + e.message); }
    showLoading(false);
};

/* おしらせタブ本文編集モーダルを開く（管理者専用） */
window.openNoticeEditor = function () {
    document.getElementById('notice-content-input').value = state.announcementData?.noticeContent || '';
    window.openModal('notice-edit-modal');
};

/* おしらせタブ本文を保存する */
window.saveNoticeContent = async function () {
    const noticeContent = document.getElementById('notice-content-input').value.trim();
    showLoading(true);
    try {
        await setDoc(doc(db, 'settings', 'announcement'), { ...state.announcementData, noticeContent });
        state.announcementData = { ...state.announcementData, noticeContent };
        renderBanner();
        window.closeAllModals();
    } catch (e) { alert('保存に失敗しました: ' + e.message); }
    showLoading(false);
};
