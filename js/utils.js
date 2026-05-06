/* ============================================================
 * utils.js — 汎用ヘルパー関数
 *
 * C言語の「標準ユーティリティライブラリ」に相当する。
 * 他のモジュールに依存しない純粋な関数だけをまとめる。
 * ============================================================ */

import { state } from './config.js';

/* 全角数字を半角に変換（スマホ入力対応） */
export function convertToHalfWidth(str) {
    if (!str) return str;
    return str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}

/* XSS対策のHTMLエスケープ */
export function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* チェックボックスから施光種類文字列を生成（例: "⑧ ⑦"） */
export function getSelectedTypes(prefix) {
    const t = [];
    [`${prefix}-8`, `${prefix}-7`, `${prefix}-6`, `${prefix}-1`, `${prefix}-mikunite`].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.checked) t.push(el.value);
    });
    const ct = document.getElementById(`${prefix}-custom`);
    if (ct && ct.value.trim()) t.push(ct.value.trim());
    return t.join(' ');
}

/* 今日の日付を "YYYY-MM-DD" 形式で返す */
export function getToday() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/* ローディングスピナーの表示切替 */
export function showLoading(show) {
    document.getElementById('loading-indicator').classList.toggle('hidden', !show);
}

/* 施光・受光の日付入力欄に今日の日付をセットする */
export function setTodayDate() {
    const today = getToday();
    document.getElementById('selected-date').value = today;
    document.getElementById('receive-selected-date').value = today;
}

/* 施光入力フォームをリセット */
export function clearInputs() {
    document.getElementById('person-name').value = '';
    document.getElementById('play-time').value = '10';
    ['type-8', 'type-7', 'type-6', 'type-1', 'type-mikunite'].forEach(id =>
        document.getElementById(id).checked = false);
    document.getElementById('type-custom').value = '';
    document.getElementById('location').value = '';
    document.getElementById('give-memo').value = '';
    const btn = document.getElementById('history-check-btn');
    if (btn) btn.disabled = true;
}

/* 受光入力フォームをリセット */
export function clearReceiveInputs() {
    document.getElementById('receive-person').value = '';
    document.getElementById('receive-time').value = '10';
    ['receive-type-8', 'receive-type-7', 'receive-type-6', 'receive-type-1'].forEach(id =>
        document.getElementById(id).checked = false);
    document.getElementById('receive-type-custom').value = '';
    document.getElementById('receive-location').value = '';
    if (window._refreshReceivePersonSuggest) window._refreshReceivePersonSuggest();
}

/* 場所履歴をlocalStorageに保存 */
export function saveLocationHistory(location) {
    if (!location || !state.currentUser) return;
    let history = JSON.parse(localStorage.getItem('locationHistory_' + state.currentUser.uid) || '[]');
    history = [location, ...history.filter(h => h !== location)].slice(0, 10);
    localStorage.setItem('locationHistory_' + state.currentUser.uid, JSON.stringify(history));
}

/* localStorageと既存記録から場所候補リストを返す（使用頻度順） */
export function getLocationHistory() {
    const stored = JSON.parse(localStorage.getItem('locationHistory_' + (state.currentUser?.uid || '')) || '[]');
    const fromRecords = [
        ...state.records.map(r => r.location),
        ...state.receiveRecords.map(r => r.location)
    ].filter(l => l && l.trim());
    const all = [...new Set([...stored, ...fromRecords])];
    const freq = {};
    fromRecords.forEach(l => { freq[l] = (freq[l] || 0) + 1; });
    return all.sort((a, b) => (freq[b] || 0) - (freq[a] || 0)).slice(0, 15);
}
