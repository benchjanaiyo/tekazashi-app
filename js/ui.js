/* ============================================================
 * ui.js — UI共通処理（タブ切り替え・スワイプ・モーダル・サジェスト）
 *
 * C言語の「UIフレームワークモジュール」に相当する。
 * アプリ全体のナビゲーションとUI動作を担当する。
 * 各タブ固有の処理（updateCalendar等）は window.xxx 経由で呼ぶ。
 * ============================================================ */

import { db, state, typeTimeMap, receiveTypeTimeMap } from './config.js';
import { getLocationHistory } from './utils.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===================== タブ切り替え ===================== */

const TAB_ORDER = ['give', 'receive', 'calendar', 'stats', 'data'];
let currentTabIndex = 0;

function getSlider() { return document.getElementById('tab-slider'); }

/* スライダー位置を移動する（animate=false のとき即時移動） */
function moveSlider(index, animate) {
    const slider = getSlider();
    if (!animate) slider.classList.add('no-transition');
    slider.style.transform = `translateX(-${index * 20}%)`;
    if (!animate) {
        slider.offsetHeight; /* reflow で即時反映 */
        slider.classList.remove('no-transition');
    }
}

window.showView = function (viewName, animate) {
    TAB_ORDER.forEach(v => document.getElementById('tab-' + v).classList.remove('active'));
    document.getElementById('tab-' + viewName).classList.add('active');
    currentTabIndex = TAB_ORDER.indexOf(viewName);
    moveSlider(currentTabIndex, animate === true);
    document.getElementById('tab-' + viewName).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    if (viewName === 'calendar') setTimeout(() => window.updateCalendar && window.updateCalendar(), 50);
    else if (viewName === 'stats') {
        setTimeout(() => window.updateStats    && window.updateStats(), 50);
        setTimeout(() => window.loadUsageLogs  && window.loadUsageLogs(), 50);
    }
};

/* ===================== スワイプ（タッチ追従アニメーション） ===================== */

export function setupSwipe() {
    const wrapper = document.querySelector('.tab-content-wrapper');
    let startX = 0, startY = 0, currentX = 0;
    let isSwiping = false, isHorizontal = null;
    const THRESHOLD = 80; /* タブ切り替えに必要な最小スワイプ距離（px） */

    wrapper.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentX     = 0;
        isSwiping    = true;
        isHorizontal = null;
        getSlider().classList.add('no-transition');
    }, { passive: true });

    wrapper.addEventListener('touchmove', e => {
        if (!isSwiping) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (isHorizontal === null) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8)
                isHorizontal = Math.abs(dx) > Math.abs(dy);
            return;
        }
        if (!isHorizontal) return;
        currentX = dx;
        /* 端タブでは強い抵抗感（resistance）を出す */
        const atLeft  = currentTabIndex === 0 && dx > 0;
        const atRight = currentTabIndex === TAB_ORDER.length - 1 && dx < 0;
        const resistance = (atLeft || atRight) ? 0.08 : 0.4;
        const offset = currentTabIndex * 20 - (dx * resistance / wrapper.offsetWidth) * 100;
        getSlider().style.transform = `translateX(-${offset}%)`;
    }, { passive: true });

    wrapper.addEventListener('touchend', () => {
        if (!isSwiping) return;
        isSwiping = false;
        getSlider().classList.remove('no-transition');
        if (isHorizontal && Math.abs(currentX) > THRESHOLD) {
            if      (currentX < 0 && currentTabIndex < TAB_ORDER.length - 1)
                window.showView(TAB_ORDER[currentTabIndex + 1], true);
            else if (currentX > 0 && currentTabIndex > 0)
                window.showView(TAB_ORDER[currentTabIndex - 1], true);
            else moveSlider(currentTabIndex, true);
        } else {
            moveSlider(currentTabIndex, true);
        }
        currentX = 0;
    }, { passive: true });
}

/* ===================== モーダル ===================== */

window.openModal = function (id) {
    document.getElementById(id).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeAllModals = function () {
    ['edit-modal', 'duplicate-modal', 'memo-modal', 'edit-receive-modal',
     'history-modal', 'announcement-modal', 'notice-edit-modal', 'settings-modal']
        .forEach(id => document.getElementById(id).classList.add('hidden'));
    state.editingRecord = null;
    state.duplicateInfo = null;
    state.editingMemo   = null;
    state.editingReceiveRecord = null;
    document.body.style.overflow = '';
};

window.openSettingsModal = function () {
    /* 現在のサブタイトルを入力欄に反映 */
    const current = document.getElementById('header-sub').textContent;
    document.getElementById('subtitle-input').value = current;
    /* 現在の集計開始月を入力欄に反映 */
    document.getElementById('stats-start-month-input').value = state.statsStartMonth || '';
    window.openModal('settings-modal');
};

/* ===================== ユーザー設定（サブタイトル・集計開始月） ===================== */

const DEFAULT_SUBTITLE = '目指せ霊文明人、地上天国';

/* ログイン後にFirestoreからユーザー設定を一括読み込み */
window.loadUserSubtitle = async function () {
    if (!state.currentUser) return;
    try {
        const snap = await getDoc(doc(db, 'userSettings', state.currentUser.uid));
        const data = snap.exists() ? snap.data() : {};

        /* サブタイトル */
        const subtitle = data.subtitle || DEFAULT_SUBTITLE;
        document.getElementById('header-sub').textContent = subtitle;

        /* 集計開始月 */
        state.statsStartMonth = data.statsStartMonth || null;
        applyStatsStartMonth();
    } catch (e) { /* 取得失敗時はデフォルトのまま */ }
};

/* 集計開始月をUIに反映する（ラベル・統計タブの期間テキスト） */
function applyStatsStartMonth() {
    const m    = state.statsStartMonth;
    const term = m ? `（${m.replace('-', '/')}〜）` : '';

    /* 施光タブの累計ラベル */
    const giveLabel = document.getElementById('give-total-label');
    if (giveLabel) giveLabel.textContent = '累計' + term;

    /* 受光タブの累計ラベル */
    const receiveLabel = document.getElementById('receive-total-label');
    if (receiveLabel) receiveLabel.textContent = '累計' + term;

    /* 統計タブの施光累計・受光累計ラベル */
    const statsGiveLabel    = document.getElementById('stats-give-total-label');
    const statsReceiveLabel = document.getElementById('stats-receive-total-label');
    if (statsGiveLabel)    statsGiveLabel.textContent    = '施光 累計' + term;
    if (statsReceiveLabel) statsReceiveLabel.textContent = '受光 累計' + term;

    /* 統計タブの集計期間テキスト */
    const periodLabel = document.getElementById('stats-period-label');
    if (periodLabel) periodLabel.textContent = m ? `集計期間：${m.replace('-', '/')}〜` : '';
}

window.saveUserSubtitle = async function () {
    if (!state.currentUser) return;
    const input    = document.getElementById('subtitle-input');
    const subtitle = input.value.trim() || DEFAULT_SUBTITLE;
    const btn      = document.getElementById('subtitle-save-btn');
    btn.disabled   = true;
    try {
        await setDoc(doc(db, 'userSettings', state.currentUser.uid), { subtitle }, { merge: true });
        document.getElementById('header-sub').textContent = subtitle;
        btn.textContent = '保存済 ✓';
        setTimeout(() => { btn.textContent = '保存'; btn.disabled = false; }, 2000);
    } catch (e) {
        alert('保存に失敗しました: ' + e.message);
        btn.disabled = false;
    }
};

window.saveStatsStartMonth = async function () {
    if (!state.currentUser) return;
    const val = document.getElementById('stats-start-month-input').value; /* "YYYY-MM" or "" */
    const btn = document.getElementById('stats-start-month-save-btn');
    btn.disabled = true;
    try {
        await setDoc(doc(db, 'userSettings', state.currentUser.uid),
            { statsStartMonth: val || null }, { merge: true });
        state.statsStartMonth = val || null;
        applyStatsStartMonth();
        window.updateStats && window.updateStats();
        btn.textContent = '保存済 ✓';
        setTimeout(() => { btn.textContent = '保存'; btn.disabled = false; }, 2000);
    } catch (e) {
        alert('保存に失敗しました: ' + e.message);
        btn.disabled = false;
    }
};

window.clearStatsStartMonth = async function () {
    document.getElementById('stats-start-month-input').value = '';
    window.saveStatsStartMonth();
};

/* ===================== UID コピー ===================== */

window.copyUID = function () {
    const uid = state.currentUser?.uid || '';
    navigator.clipboard.writeText(uid).then(() => {
        const btn = event.target;
        btn.textContent = 'コピー済';
        setTimeout(() => btn.textContent = 'コピー', 2000);
    });
};

/* ===================== 場所サジェスト ===================== */

export function setupLocationSuggestion(inputId, suggestId) {
    const input   = document.getElementById(inputId);
    const suggest = document.getElementById(suggestId);
    input.addEventListener('focus', () => showLocSuggestions(input, suggest));
    input.addEventListener('input', () => showLocSuggestions(input, suggest));
    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !suggest.contains(e.target))
            suggest.classList.add('hidden');
    });
}

function showLocSuggestions(input, suggest) {
    const history  = getLocationHistory();
    const val      = input.value.trim();
    const filtered = val ? history.filter(h => h.includes(val)) : history;
    if (filtered.length === 0) { suggest.classList.add('hidden'); return; }
    suggest.innerHTML = '';
    filtered.forEach(loc => {
        const div       = document.createElement('div');
        div.className   = 'suggest-item';
        div.textContent = loc;
        div.onclick     = () => { input.value = loc; suggest.classList.add('hidden'); };
        suggest.appendChild(div);
    });
    suggest.classList.remove('hidden');
}

/* ===================== 施光の名前サジェスト ===================== */

export function setupGiveNameSuggest() {
    const giveNameInput   = document.getElementById('person-name');
    const giveNameSuggest = document.getElementById('person-name-suggest');

    function showGiveNameSuggest() {
        const val = giveNameInput.value.trim();
        const all = [...new Set(state.records.map(r => r.person))].sort((a, b) => {
            const ca = state.records.filter(r => r.person === a).length;
            const cb = state.records.filter(r => r.person === b).length;
            return cb - ca;
        });
        const filtered = val ? all.filter(n => n.includes(val)) : all;
        if (filtered.length === 0) { giveNameSuggest.classList.add('hidden'); return; }
        giveNameSuggest.innerHTML = '';
        filtered.forEach(name => {
            const div       = document.createElement('div');
            div.className   = 'suggest-item';
            div.textContent = name;
            div.onclick     = () => {
                giveNameInput.value = name;
                giveNameSuggest.classList.add('hidden');
                updateHistoryBtn();
            };
            giveNameSuggest.appendChild(div);
        });
        giveNameSuggest.classList.remove('hidden');
    }

    function updateHistoryBtn() {
        const btn = document.getElementById('history-check-btn');
        if (btn) btn.disabled = !giveNameInput.value.trim();
    }

    giveNameInput.addEventListener('input',   () => { showGiveNameSuggest(); updateHistoryBtn(); });
    giveNameInput.addEventListener('focus',   showGiveNameSuggest);
    giveNameInput.addEventListener('change',  updateHistoryBtn);
    giveNameInput.addEventListener('keypress', e => { if (e.key === 'Enter') updateHistoryBtn(); });
    document.addEventListener('click', e => {
        if (!giveNameInput.contains(e.target) && !giveNameSuggest.contains(e.target))
            giveNameSuggest.classList.add('hidden');
    });
}

/* ===================== 時間自動計算 ===================== */

window.updatePlayTime = function () {
    let total = 0;
    ['type-8', 'type-7', 'type-6', 'type-1'].forEach(id => {
        if (document.getElementById(id).checked) total += typeTimeMap[id];
    });
    if (total > 0) document.getElementById('play-time').value = total;
};

window.updateReceiveTime = function () {
    let total = 0;
    ['receive-type-8', 'receive-type-7', 'receive-type-6', 'receive-type-1'].forEach(id => {
        if (document.getElementById(id).checked) total += receiveTypeTimeMap[id];
    });
    if (total > 0) document.getElementById('receive-time').value = total;
};

window.updateEditPlayTime = function () {
    let total = 0;
    ['edit-type-8', 'edit-type-7', 'edit-type-6', 'edit-type-1'].forEach(id => {
        if (document.getElementById(id) && document.getElementById(id).checked)
            total += typeTimeMap[id.replace('edit-', '')];
    });
    if (total > 0) document.getElementById('edit-playtime').value = total;
};
