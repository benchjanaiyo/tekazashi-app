/* ============================================================
 * stats.js — 統計タブ + 管理者利用状況
 *
 * C言語の「集計処理モジュール」に相当する。
 * ・updateStats()    — 全カード・人別・月別・年別を更新
 * ・switchStatTab()  — 統計サブタブ切り替え
 * ・loadUsageLogs()  — 管理者専用：メンバー利用状況をFirestoreから取得
 * ============================================================ */

import { db, ADMIN_UID, state }          from './config.js';
import { escapeHtml, getToday }          from './utils.js';
import { collection, getDocsFromServer } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===================== サブタブ切り替え ===================== */

window.switchStatTab = function (tab) {
    ['people', 'monthly', 'yearly', 'admin'].forEach(t => {
        const btn  = document.getElementById('stat-tab-' + t);
        const view = document.getElementById('stat-view-' + t);
        if (btn)  btn.classList.toggle('active', t === tab);
        if (view) view.classList.toggle('hidden', t !== tab);
    });
    if (tab === 'admin') window.loadUsageLogs && window.loadUsageLogs();
};

/* ===================== 統計集計と画面更新 ===================== */

window.updateStats = function () {
    const thisMonth      = getToday().substring(0, 7);
    const total          = state.records.length;
    const monthCount     = state.records.filter(r => r.date.startsWith(thisMonth)).length;
    const totalTime      = state.records.reduce((s, r) => s + (parseInt(r.playTime) || 0), 0);
    const receiveTotal   = state.receiveRecords.length;
    const receiveMonth   = state.receiveRecords.filter(r => r.date.startsWith(thisMonth)).length;

    /* 施光タブのサマリーカード */
    const elTotal = document.getElementById('total-records');
    const elMonth = document.getElementById('month-records');
    const elTime  = document.getElementById('total-time');
    if (elTotal) elTotal.textContent = total;
    if (elMonth) elMonth.textContent = monthCount;
    if (elTime)  elTime.textContent  = totalTime;

    /* 受光タブのサマリーカード */
    const elReceiveTotal = document.getElementById('receive-total-records');
    const elReceiveMonth = document.getElementById('receive-month-records');
    if (elReceiveTotal) elReceiveTotal.textContent = receiveTotal;
    if (elReceiveMonth) elReceiveMonth.textContent = receiveMonth;

    /* 統計タブのサマリーカード */
    const el = id => document.getElementById(id);
    if (el('stats-total-records'))  el('stats-total-records').textContent  = total + '回';
    if (el('stats-month-records'))  el('stats-month-records').textContent  = monthCount + '回';
    if (el('stats-receive-total'))  el('stats-receive-total').textContent  = receiveTotal + '回';
    if (el('stats-receive-month'))  el('stats-receive-month').textContent  = receiveMonth + '回';

    /* 管理者タブボタンの表示制御 */
    const adminBtn = el('stat-tab-admin');
    if (adminBtn) adminBtn.classList.toggle('hidden', state.currentUser?.uid !== ADMIN_UID);

    /* 各セクション描画 */
    renderPeopleStats();
    renderReceivePeopleStats();
    renderMonthlyStats();
    renderYearlyStats();
};

/* ===================== 施光 — 人別 ===================== */

function renderPeopleStats() {
    const div = document.getElementById('people-stats');
    if (!div) return;
    div.innerHTML = '';

    const peopleStats = {};
    state.records.forEach(r => {
        if (!peopleStats[r.person]) peopleStats[r.person] = { count: 0, totalTime: 0 };
        peopleStats[r.person].count++;
        if (r.playTime) peopleStats[r.person].totalTime += parseInt(r.playTime) || 0;
    });

    if (Object.keys(peopleStats).length === 0) {
        div.innerHTML = '<p style="color:var(--gray-400);font-size:14px;padding:12px 0;">記録がありません</p>';
        return;
    }

    const mikuniteCount = state.records.filter(r => r.types && r.types.includes('未組手')).length;
    if (mikuniteCount > 0) {
        const mdiv = document.createElement('div');
        mdiv.className = 'stat-row';
        mdiv.style.cssText = 'background:#fef9c3;border-radius:8px;padding:12px;margin-bottom:8px;';
        mdiv.innerHTML = `<span class="stat-name">🌱 未組手への施光</span><div class="stat-nums"><span style="color:#854d0e;font-weight:600;">${mikuniteCount}回</span></div>`;
        div.appendChild(mdiv);
    }

    Object.entries(peopleStats).sort(([, a], [, b]) => b.count - a.count).forEach(([person, stats]) => {
        const isMikunite = state.records.some(r => r.person === person && r.types && r.types.includes('未組手'));
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = `
            <span class="stat-name">${escapeHtml(person)}${isMikunite ? ' <span style="font-size:12px;background:#fef9c3;color:#854d0e;padding:1px 6px;border-radius:8px;">未組手</span>' : ''}</span>
            <div style="display:flex;align-items:center;gap:10px;">
                <div class="stat-nums">
                    <span>${stats.count}回</span>
                    ${stats.totalTime > 0 ? `<span>計${stats.totalTime}分</span>` : ''}
                </div>
                <button onclick="showMemoModal('${escapeHtml(person)}')"
                    style="padding:4px 10px;font-size:12px;background:var(--blue-50);border:1px solid var(--blue-200);color:var(--blue-700);border-radius:8px;cursor:pointer;white-space:nowrap;">📋 履歴</button>
            </div>`;
        div.appendChild(row);
    });
}

/* ===================== 受光 — 人別 ===================== */

function renderReceivePeopleStats() {
    const div = document.getElementById('receive-people-stats');
    if (!div) return;
    div.innerHTML = '';

    const receiveStats = {};
    state.receiveRecords.forEach(r => {
        if (!receiveStats[r.person]) receiveStats[r.person] = { count: 0, totalTime: 0 };
        receiveStats[r.person].count++;
        if (r.receiveTime) receiveStats[r.person].totalTime += parseInt(r.receiveTime) || 0;
    });

    if (Object.keys(receiveStats).length === 0) {
        div.innerHTML = '<p style="color:var(--gray-400);font-size:14px;padding:12px 0;">記録がありません</p>';
        return;
    }

    Object.entries(receiveStats).sort(([, a], [, b]) => b.count - a.count).forEach(([person, stats]) => {
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = `
            <span class="stat-name">${escapeHtml(person)}</span>
            <div class="stat-nums">
                <span>${stats.count}回</span>
                ${stats.totalTime > 0 ? `<span>計${stats.totalTime}分</span>` : ''}
            </div>`;
        div.appendChild(row);
    });
}

/* ===================== 月別統計 ===================== */

function renderMonthlyStats() {
    const div = document.getElementById('monthly-stats');
    if (!div) return;
    div.innerHTML = '';

    const giveMap = {}, receiveMap = {};
    state.records.forEach(r => {
        const k = r.date.substring(0, 7);
        giveMap[k] = (giveMap[k] || 0) + 1;
    });
    state.receiveRecords.forEach(r => {
        const k = r.date.substring(0, 7);
        receiveMap[k] = (receiveMap[k] || 0) + 1;
    });

    const months = [...new Set([...Object.keys(giveMap), ...Object.keys(receiveMap)])].sort((a, b) => b.localeCompare(a));

    if (months.length === 0) {
        div.innerHTML = '<p style="color:var(--gray-400);font-size:14px;padding:12px 0;">記録がありません</p>';
        return;
    }

    /* ヘッダー行 */
    const header = document.createElement('div');
    header.className = 'stat-row';
    header.innerHTML = `
        <span style="flex:1;font-weight:600;color:var(--gray-600);">月</span>
        <span style="width:56px;text-align:right;font-weight:600;color:var(--blue-700);">施光</span>
        <span style="width:56px;text-align:right;font-weight:600;color:var(--green-700);">受光</span>`;
    div.appendChild(header);

    months.forEach(month => {
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = `
            <span style="flex:1;">${month.replace('-', '年')}月</span>
            <span style="width:56px;text-align:right;color:var(--blue-700);">${giveMap[month] || 0}回</span>
            <span style="width:56px;text-align:right;color:var(--green-700);">${receiveMap[month] || 0}回</span>`;
        div.appendChild(row);
    });
}

/* ===================== 年別統計 ===================== */

function renderYearlyStats() {
    const div = document.getElementById('yearly-stats');
    if (!div) return;
    div.innerHTML = '';

    const giveMap = {}, receiveMap = {};
    state.records.forEach(r => {
        const k = r.date.substring(0, 4);
        giveMap[k] = (giveMap[k] || 0) + 1;
    });
    state.receiveRecords.forEach(r => {
        const k = r.date.substring(0, 4);
        receiveMap[k] = (receiveMap[k] || 0) + 1;
    });

    const years = [...new Set([...Object.keys(giveMap), ...Object.keys(receiveMap)])].sort((a, b) => b.localeCompare(a));

    if (years.length === 0) {
        div.innerHTML = '<p style="color:var(--gray-400);font-size:14px;padding:12px 0;">記録がありません</p>';
        return;
    }

    /* ヘッダー行 */
    const header = document.createElement('div');
    header.className = 'stat-row';
    header.innerHTML = `
        <span style="flex:1;font-weight:600;color:var(--gray-600);">年</span>
        <span style="width:56px;text-align:right;font-weight:600;color:var(--blue-700);">施光</span>
        <span style="width:56px;text-align:right;font-weight:600;color:var(--green-700);">受光</span>`;
    div.appendChild(header);

    years.forEach(year => {
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = `
            <span style="flex:1;">${year}年</span>
            <span style="width:56px;text-align:right;color:var(--blue-700);">${giveMap[year] || 0}回</span>
            <span style="width:56px;text-align:right;color:var(--green-700);">${receiveMap[year] || 0}回</span>`;
        div.appendChild(row);
    });
}

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
