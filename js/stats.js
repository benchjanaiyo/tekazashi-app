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

/* ===================== チャートインスタンス管理 ===================== */

let monthlyChartInst    = null;
let cumulativeChartInst = null;
let peopleChartInst     = null;
let monthlyChartMode    = 'give'; /* 'give' | 'receive' | 'stack' */

/* 現在アクティブな統計サブタブ名を返す */
function currentStatTab() {
    for (const t of ['people', 'monthly', 'yearly', 'admin']) {
        const btn = document.getElementById('stat-tab-' + t);
        if (btn && btn.classList.contains('active')) return t;
    }
    return 'people';
}

/* フィルター済み配列を返す共通ヘルパー */
function filteredRecords() {
    const start = state.statsStartMonth || null;
    return {
        give:    start ? state.records.filter(r => r.date >= start)        : state.records,
        receive: start ? state.receiveRecords.filter(r => r.date >= start) : state.receiveRecords
    };
}

/* ===================== サブタブ切り替え ===================== */

window.switchStatTab = function (tab) {
    ['people', 'monthly', 'yearly', 'admin'].forEach(t => {
        const btn  = document.getElementById('stat-tab-' + t);
        const view = document.getElementById('stat-view-' + t);
        if (btn)  btn.classList.toggle('active', t === tab);
        if (view) view.classList.toggle('hidden', t !== tab);
    });
    /* タブが表示状態になってからチャートを描画 */
    const { give, receive } = filteredRecords();
    if (tab === 'monthly') { renderMonthlyChart(give, receive); renderCumulativeChart(give, receive); }
    if (tab === 'admin')   window.loadUsageLogs && window.loadUsageLogs();
};

/* ===================== 月別グラフ モード切替 ===================== */

window.setMonthlyChartMode = function (mode) {
    monthlyChartMode = mode;
    const styles = { give: 'active-blue', receive: 'active-green', stack: 'active-stack' };
    ['give', 'receive', 'stack'].forEach(m => {
        const btn = document.getElementById('chart-monthly-' + m);
        if (!btn) return;
        btn.classList.remove('active-blue', 'active-green', 'active-stack');
        if (m === mode) btn.classList.add(styles[m]);
    });
    const { give, receive } = filteredRecords();
    renderMonthlyChart(give, receive);
};

/* ===================== 統計集計と画面更新 ===================== */

window.updateStats = function () {
    const thisMonth      = getToday().substring(0, 7);
    const startMonth     = state.statsStartMonth || null; /* "YYYY-MM" or null */

    /* 集計開始月フィルター（startMonthがあればそれ以降のみ対象） */
    const giveFiltered    = startMonth ? state.records.filter(r => r.date >= startMonth) : state.records;
    const receiveFiltered = startMonth ? state.receiveRecords.filter(r => r.date >= startMonth) : state.receiveRecords;

    const total          = giveFiltered.length;
    const monthCount     = giveFiltered.filter(r => r.date.startsWith(thisMonth)).length;
    const totalTime      = giveFiltered.reduce((s, r) => s + (parseInt(r.playTime) || 0), 0);
    const receiveTotal   = receiveFiltered.length;
    const receiveMonth   = receiveFiltered.filter(r => r.date.startsWith(thisMonth)).length;

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

    /* 各セクション描画（フィルター済み配列を渡す） */
    renderPeopleStats(giveFiltered);
    renderReceivePeopleStats(receiveFiltered);
    renderMonthlyStats(giveFiltered, receiveFiltered);
    renderYearlyStats(giveFiltered, receiveFiltered);

    /* チャートは表示中のタブのみ描画（非表示キャンバスはサイズ0になるため） */
    const tab = currentStatTab();
    if (tab === 'monthly') { renderMonthlyChart(giveFiltered, receiveFiltered); renderCumulativeChart(giveFiltered, receiveFiltered); }
};

/* ===================== 施光 — 人別 ===================== */

function renderPeopleStats(records) {
    const div = document.getElementById('people-stats');
    if (!div) return;
    div.innerHTML = '';

    const peopleStats = {};
    records.forEach(r => {
        if (!peopleStats[r.person]) peopleStats[r.person] = { count: 0, totalTime: 0 };
        peopleStats[r.person].count++;
        if (r.playTime) peopleStats[r.person].totalTime += parseInt(r.playTime) || 0;
    });

    if (Object.keys(peopleStats).length === 0) {
        div.innerHTML = '<p style="color:var(--gray-400);font-size:14px;padding:12px 0;">記録がありません</p>';
        return;
    }

    const mikuniteCount = records.filter(r => r.types && r.types.includes('未組手')).length;
    if (mikuniteCount > 0) {
        const mdiv = document.createElement('div');
        mdiv.className = 'stat-row';
        mdiv.style.cssText = 'background:#fef9c3;border-radius:8px;padding:12px;margin-bottom:8px;';
        mdiv.innerHTML = `<span class="stat-name">🌱 未組手への施光</span><div class="stat-nums"><span style="color:#854d0e;font-weight:600;">${mikuniteCount}回</span></div>`;
        div.appendChild(mdiv);
    }

    Object.entries(peopleStats).sort(([, a], [, b]) => b.count - a.count).forEach(([person, stats]) => {
        const isMikunite = records.some(r => r.person === person && r.types && r.types.includes('未組手'));
        const row = document.createElement('div');
        row.className = 'stat-row';

        const nameSpan = document.createElement('span');
        nameSpan.className   = 'stat-name';
        nameSpan.textContent = person;
        if (isMikunite) {
            const tag = document.createElement('span');
            tag.style.cssText = 'font-size:12px;background:#fef9c3;color:#854d0e;padding:1px 6px;border-radius:8px;margin-left:6px;';
            tag.textContent   = '未組手';
            nameSpan.appendChild(tag);
        }

        const right = document.createElement('div');
        right.style.cssText = 'display:flex;align-items:center;gap:10px;';
        const nums = document.createElement('div');
        nums.className = 'stat-nums';
        const cnt = document.createElement('span');
        cnt.textContent = stats.count + '回';
        nums.appendChild(cnt);
        if (stats.totalTime > 0) {
            const tm = document.createElement('span');
            tm.textContent = '計' + stats.totalTime + '分';
            nums.appendChild(tm);
        }
        const btn = document.createElement('button');
        btn.style.cssText = 'padding:4px 10px;font-size:12px;background:var(--blue-50);border:1px solid var(--blue-200);color:var(--blue-700);border-radius:8px;cursor:pointer;white-space:nowrap;';
        btn.textContent   = '📋 履歴';
        btn.addEventListener('click', () => window.showMemoModal(person));
        right.appendChild(nums);
        right.appendChild(btn);

        row.appendChild(nameSpan);
        row.appendChild(right);
        div.appendChild(row);
    });
}

/* ===================== 受光 — 人別 ===================== */

function renderReceivePeopleStats(records) {
    const div = document.getElementById('receive-people-stats');
    if (!div) return;
    div.innerHTML = '';

    const receiveStats = {};
    records.forEach(r => {
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
        const nameSpan = document.createElement('span');
        nameSpan.className   = 'stat-name';
        nameSpan.textContent = person;
        const nums = document.createElement('div');
        nums.className = 'stat-nums';
        const cnt = document.createElement('span');
        cnt.textContent = stats.count + '回';
        nums.appendChild(cnt);
        if (stats.totalTime > 0) {
            const tm = document.createElement('span');
            tm.textContent = '計' + stats.totalTime + '分';
            nums.appendChild(tm);
        }
        row.appendChild(nameSpan);
        row.appendChild(nums);
        div.appendChild(row);
    });
}

/* ===================== 月別統計 ===================== */

function renderMonthlyStats(giveRecords, receiveRecords) {
    const div = document.getElementById('monthly-stats');
    if (!div) return;
    div.innerHTML = '';

    const giveMap = {}, receiveMap = {};
    giveRecords.forEach(r => {
        const k = r.date.substring(0, 7);
        giveMap[k] = (giveMap[k] || 0) + 1;
    });
    receiveRecords.forEach(r => {
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

function renderYearlyStats(giveRecords, receiveRecords) {
    const div = document.getElementById('yearly-stats');
    if (!div) return;
    div.innerHTML = '';

    const giveMap = {}, receiveMap = {};
    giveRecords.forEach(r => {
        const k = r.date.substring(0, 4);
        giveMap[k] = (giveMap[k] || 0) + 1;
    });
    receiveRecords.forEach(r => {
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

/* ===================== 人別グラフ（B） ===================== */

function renderPeopleChart(records) {
    const container = document.getElementById('people-chart-container');
    if (!container || typeof Chart === 'undefined') return;

    const countMap = {};
    records.forEach(r => { countMap[r.person] = (countMap[r.person] || 0) + 1; });
    const sorted = Object.entries(countMap).sort(([, a], [, b]) => a - b); /* 昇順＝上から少ない順（Chart.jsは配列先頭が上） */
    const labels = sorted.map(([name]) => name);
    const data   = sorted.map(([, c]) => c);

    const h = Math.max(150, labels.length * 34 + 20);
    container.style.height = h + 'px';

    /* 既存のキャンバスを作り直す */
    container.innerHTML = '<canvas id="people-chart"></canvas>';
    if (peopleChartInst) { peopleChartInst.destroy(); peopleChartInst = null; }

    peopleChartInst = new Chart(document.getElementById('people-chart'), {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 4 }] },
        options: {
            indexAxis: 'y', maintainAspectRatio: false, responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
                y: { ticks: { font: { size: 13 } } }
            }
        }
    });
}

/* ===================== 月別グラフ（A） ===================== */

function renderMonthlyChart(giveRecords, receiveRecords) {
    const container = document.getElementById('monthly-chart-container');
    if (!container || typeof Chart === 'undefined') return;

    const giveMap = {}, receiveMap = {};
    giveRecords.forEach(r    => { const k = r.date.substring(0, 7); giveMap[k]    = (giveMap[k]    || 0) + 1; });
    receiveRecords.forEach(r => { const k = r.date.substring(0, 7); receiveMap[k] = (receiveMap[k] || 0) + 1; });
    const months = [...new Set([...Object.keys(giveMap), ...Object.keys(receiveMap)])].sort();
    const labels     = months.map(m => m.replace('-', '/'));
    const giveData   = months.map(m => giveMap[m]    || 0);
    const receiveData = months.map(m => receiveMap[m] || 0);

    container.style.height = '220px';
    container.innerHTML = '<canvas id="monthly-chart"></canvas>';
    if (monthlyChartInst) { monthlyChartInst.destroy(); monthlyChartInst = null; }

    const mode = monthlyChartMode;
    let datasets;
    if (mode === 'give') {
        datasets = [{ data: giveData,    backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 3 }];
    } else if (mode === 'receive') {
        datasets = [{ data: receiveData, backgroundColor: 'rgba(22,163,74,0.7)',  borderRadius: 3 }];
    } else {
        datasets = [
            { label: '施光', data: giveData,    backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 3, stack: 'a' },
            { label: '受光', data: receiveData, backgroundColor: 'rgba(22,163,74,0.7)',  borderRadius: 3, stack: 'a' }
        ];
    }

    monthlyChartInst = new Chart(document.getElementById('monthly-chart'), {
        type: 'bar',
        data: { labels, datasets },
        options: {
            maintainAspectRatio: false, responsive: true,
            plugins: { legend: { display: mode === 'stack', position: 'top', labels: { boxWidth: 12, font: { size: 12 } } } },
            scales: {
                x: { stacked: mode === 'stack', ticks: { font: { size: 11 }, maxRotation: 45 } },
                y: { beginAtZero: true, stacked: mode === 'stack', ticks: { precision: 0, font: { size: 11 } } }
            }
        }
    });
}

/* ===================== 累積折れ線グラフ（C） ===================== */

function renderCumulativeChart(giveRecords, receiveRecords) {
    const canvas = document.getElementById('cumulative-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const giveMap = {}, receiveMap = {};
    giveRecords.forEach(r    => { const k = r.date.substring(0, 7); giveMap[k]    = (giveMap[k]    || 0) + 1; });
    receiveRecords.forEach(r => { const k = r.date.substring(0, 7); receiveMap[k] = (receiveMap[k] || 0) + 1; });
    const months = [...new Set([...Object.keys(giveMap), ...Object.keys(receiveMap)])].sort();
    const labels = months.map(m => m.replace('-', '/'));

    let gc = 0, rc = 0;
    const giveData    = months.map(m => { gc += (giveMap[m]    || 0); return gc; });
    const receiveData = months.map(m => { rc += (receiveMap[m] || 0); return rc; });

    if (cumulativeChartInst) { cumulativeChartInst.destroy(); cumulativeChartInst = null; }

    cumulativeChartInst = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: '施光', data: giveData,    borderColor: 'rgb(37,99,235)',  backgroundColor: 'rgba(37,99,235,0.08)', fill: true, tension: 0.3, pointRadius: 3 },
                { label: '受光', data: receiveData, borderColor: 'rgb(22,163,74)',  backgroundColor: 'rgba(22,163,74,0.08)',  fill: true, tension: 0.3, pointRadius: 3 }
            ]
        },
        options: {
            maintainAspectRatio: false, responsive: true,
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } } },
            scales: {
                x: { ticks: { font: { size: 11 }, maxRotation: 45 } },
                y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } }
            }
        }
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
    } catch (e) { console.warn('利用状況の取得に失敗:', e); }
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
