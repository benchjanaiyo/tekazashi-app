/* ============================================================
 * stats.js — 統計タブ + 管理者利用状況
 *
 * C言語の「集計処理モジュール」に相当する。
 * ・updateStats()   — 施光タブのサマリーカード + 統計タブの人別/月別集計
 * ・loadUsageLogs() — 管理者専用：メンバー利用状況をFirestoreから取得
 * ============================================================ */

import { db, ADMIN_UID, state }          from './config.js';
import { escapeHtml, getToday }          from './utils.js';
import { collection, getDocsFromServer } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===================== 統計集計と画面更新 ===================== */

window.updateStats = function () {
    const total     = state.records.length;
    const thisMonth = getToday().substring(0, 7);
    const monthCount = state.records.filter(r => r.date.startsWith(thisMonth)).length;
    const totalTime  = state.records.reduce((s, r) => s + (parseInt(r.playTime) || 0), 0);

    /* 施光タブのサマリーカード */
    const elTotal = document.getElementById('total-records');
    const elMonth = document.getElementById('month-records');
    const elTime  = document.getElementById('total-time');
    if (elTotal) elTotal.textContent = total;
    if (elMonth) elMonth.textContent = monthCount;
    if (elTime)  elTime.textContent  = totalTime;

    /* 統計タブのヘッダーカード */
    const statsTotal = document.getElementById('stats-total-records');
    const statsTime  = document.getElementById('stats-total-time');
    if (statsTotal) statsTotal.textContent = total + '回';
    if (statsTime)  statsTime.textContent  = totalTime + '分';

    /* 人別統計 */
    const peopleStats = {};
    state.records.forEach(r => {
        if (!peopleStats[r.person]) peopleStats[r.person] = { count: 0, totalTime: 0 };
        peopleStats[r.person].count++;
        if (r.playTime) peopleStats[r.person].totalTime += parseInt(r.playTime) || 0;
    });
    const peopleStatsDiv = document.getElementById('people-stats');
    if (peopleStatsDiv) {
        peopleStatsDiv.innerHTML = '';
        const mikuniteCount = state.records.filter(r => r.types && r.types.includes('未組手')).length;
        if (mikuniteCount > 0) {
            const mdiv = document.createElement('div');
            mdiv.className = 'stat-row';
            mdiv.style.cssText = 'background:#fef9c3;border-radius:8px;padding:12px;margin-bottom:8px;';
            mdiv.innerHTML = `<span class="stat-name">🌱 未組手への施光</span><div class="stat-nums"><span style="color:#854d0e;font-weight:600;">${mikuniteCount}回</span></div>`;
            peopleStatsDiv.appendChild(mdiv);
        }
        Object.entries(peopleStats).sort(([, a], [, b]) => b.count - a.count).forEach(([person, stats]) => {
            const isMikunite = state.records.some(r => r.person === person && r.types && r.types.includes('未組手'));
            const div = document.createElement('div');
            div.className = 'stat-row';
            div.innerHTML = `
                <span class="stat-name">${escapeHtml(person)}${isMikunite ? ' <span style="font-size:12px;background:#fef9c3;color:#854d0e;padding:1px 6px;border-radius:8px;">未組手</span>' : ''}</span>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="stat-nums">
                        <span>${stats.count}回</span>
                        ${stats.totalTime > 0 ? `<span>計${stats.totalTime}分</span>` : ''}
                    </div>
                    <button onclick="showMemoModal('${escapeHtml(person)}')"
                        style="padding:4px 10px;font-size:12px;background:var(--blue-50);border:1px solid var(--blue-200);color:var(--blue-700);border-radius:8px;cursor:pointer;white-space:nowrap;">📋 履歴</button>
                </div>`;
            peopleStatsDiv.appendChild(div);
        });
    }

    /* 月別統計 */
    const monthlyStats = {};
    state.records.forEach(r => {
        const key = r.date.substring(0, 7);
        monthlyStats[key] = (monthlyStats[key] || 0) + 1;
    });
    const monthlyStatsDiv = document.getElementById('monthly-stats');
    if (monthlyStatsDiv) {
        monthlyStatsDiv.innerHTML = '';
        Object.entries(monthlyStats).sort(([a], [b]) => b.localeCompare(a)).forEach(([month, count]) => {
            const div = document.createElement('div');
            div.className = 'stat-row';
            div.innerHTML = `<span class="stat-name">${month.replace('-', '年')}月</span><span class="stat-nums">${count}回</span>`;
            monthlyStatsDiv.appendChild(div);
        });
    }
};

/* ===================== 管理者専用：メンバー利用状況 ===================== */

/* getDocsFromServer でキャッシュを無視してFirestoreから直接取得する */
window.loadUsageLogs = async function () {
    if (state.currentUser?.uid !== ADMIN_UID) return;
    try {
        const snap = await getDocsFromServer(collection(db, 'usageLogs'));
        const logs = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
            .sort((a, b) => (b.recordCount || 0) - (a.recordCount || 0));
        renderUsageLogs(logs);
    } catch (e) { /* 取得失敗は無視 */ }
};

function renderUsageLogs(logs) {
    const section = document.getElementById('admin-usage-section');
    const list    = document.getElementById('admin-usage-list');
    if (!section || !list) return;
    section.classList.remove('hidden');
    list.innerHTML = '';
    if (logs.length === 0) {
        list.innerHTML = '<p style="color:var(--gray-400);font-size:14px;padding:12px 0;">データがありません</p>';
        return;
    }
    logs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'stat-row';
        div.innerHTML = `
            <div style="flex:1;min-width:0;">
                <div style="font-size:15px;font-weight:600;color:var(--gray-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(log.name || '不明')}</div>
                <div style="font-size:12px;color:var(--gray-400);margin-top:2px;">最終ログイン: ${log.lastLogin || '-'} ／ ${log.loginCount || 0}回</div>
            </div>
            <div style="display:flex;gap:10px;font-size:13px;color:var(--gray-600);flex-shrink:0;text-align:right;">
                <div><span style="font-size:18px;font-weight:700;color:var(--blue-700);">${log.recordCount || 0}</span><span style="font-size:11px;display:block;">施光</span></div>
                <div><span style="font-size:18px;font-weight:700;color:var(--green-700);">${log.receiveCount || 0}</span><span style="font-size:11px;display:block;">受光</span></div>
            </div>`;
        list.appendChild(div);
    });
}
