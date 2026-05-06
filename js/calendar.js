/* ============================================================
 * calendar.js — 月別カレンダー表示
 *
 * C言語の「カレンダー描画モジュール」に相当する。
 * 月曜始まり（月火水木金土日）で施光/受光を月別に表示する。
 * サブタブで施光/受光を切り替え、フィルターボタンで絞り込める。
 * ============================================================ */

import { state } from './config.js';
import { getToday, escapeHtml } from './utils.js';

/* カレンダーを再描画する（タブ切り替え時・月移動時に呼ばれる） */
window.updateCalendar = function () {
    const year  = state.currentCalendarDate.getFullYear();
    const month = state.currentCalendarDate.getMonth();
    const today = getToday();
    document.getElementById('calendar-title').textContent = year + '年' + (month + 1) + '月';

    /* 月曜始まりの週の最初の日を算出
     * getDay()は日曜=0、月曜=1...土曜=6 なので、(day+6)%7 で月曜=0に変換 */
    const firstDay  = new Date(year, month, 1);
    const startDate = new Date(year, month, 1 - (firstDay.getDay() + 6) % 7);

    const calendarDays = document.getElementById('calendar-days');
    calendarDays.innerHTML = '';
    const anyFilterOn = Object.values(state.calFilter).some(v => v);

    /* 6週分（42マス）を生成 */
    for (let i = 0; i < 42; i++) {
        const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        const dateStr = cur.getFullYear() + '-' +
            String(cur.getMonth() + 1).padStart(2, '0') + '-' +
            String(cur.getDate()).padStart(2, '0');
        const isCurrentMonth = cur.getMonth() === month;

        /* サブタブで施光/受光を切り替え */
        let dayRecords = state.calMode === 'give'
            ? state.records.filter(r => r.date === dateStr)
            : state.receiveRecords.filter(r => r.date === dateStr);
        if (anyFilterOn) dayRecords = dayRecords.filter(recordMatchesFilter);

        const dayDiv = document.createElement('div');
        const dow    = cur.getDay();
        dayDiv.className = 'cal-day' +
            (!isCurrentMonth ? ' other-month' : '') +
            (dateStr === today  ? ' today'       : '') +
            (dow === 6          ? ' cal-day-sat'  : '') +
            (dow === 0          ? ' cal-day-sun'  : '');
        if (isCurrentMonth) dayDiv.onclick = () => selectCalendarDate(dateStr);

        const num  = document.createElement('div');
        num.className   = 'cal-num';
        num.textContent = cur.getDate();

        const dots = document.createElement('div');
        dots.className  = 'cal-dots';

        /* 全員の名前を省略せず縦に並べる */
        const people     = [...new Set(dayRecords.map(r => r.person))];
        const labelClass = state.calMode === 'give'
            ? ('give-label' + (anyFilterOn ? ' cal-label-filtered' : ''))
            : 'receive-label';
        people.forEach(p => {
            const d = document.createElement('div');
            d.className   = 'cal-label ' + labelClass;
            d.textContent = p;
            dots.appendChild(d);
        });

        dayDiv.appendChild(num);
        dayDiv.appendChild(dots);
        calendarDays.appendChild(dayDiv);
    }
};

/* 日付をタップしたら施光タブに移動してその日の記録を表示 */
function selectCalendarDate(dateStr) {
    document.getElementById('selected-date').value         = dateStr;
    document.getElementById('receive-selected-date').value = dateStr;
    window.showView('give');
    setTimeout(() => window.updateTodaysGiveRecords && window.updateTodaysGiveRecords(), 100);
}

/* フィルターに一致するか判定する（C言語のフィルタ関数に相当） */
function recordMatchesFilter(record) {
    if (!Object.values(state.calFilter).some(v => v)) return true;
    if (state.calFilter.mikunite && record.types && record.types.includes('未組手')) return true;
    if (state.calFilter.time10   && record.playTime && parseInt(record.playTime) >= 11) return true;
    if (state.calFilter.type8    && record.types && record.types.includes('⑧')) return true;
    if (state.calFilter.type7    && record.types && record.types.includes('⑦')) return true;
    if (state.calFilter.type6    && record.types && record.types.includes('⑥')) return true;
    if (state.calFilter.type1    && record.types && record.types.includes('①')) return true;
    return false;
}

/* ===================== サブタブ（施光/受光切り替え） ===================== */

window.switchCalTab = function (mode) {
    state.calMode = mode;
    document.getElementById('cal-tab-give').classList.toggle('active', mode === 'give');
    document.getElementById('cal-tab-receive').classList.toggle('active', mode === 'receive');
    const mikuniteBtn = document.getElementById('cal-filter-mikunite');
    mikuniteBtn.style.display = mode === 'receive' ? 'none' : '';
    if (mode === 'receive' && state.calFilter.mikunite) {
        state.calFilter.mikunite = false;
        mikuniteBtn.classList.remove('cal-filter-active');
    }
    window.updateCalendar();
};

/* ===================== フィルターボタン ===================== */

window.toggleCalFilter = function (key) {
    state.calFilter[key] = !state.calFilter[key];
    document.getElementById('cal-filter-' + key).classList.toggle('cal-filter-active', state.calFilter[key]);
    window.updateCalendar();
};

/* ===================== 月ナビゲーション ===================== */

window.previousMonth = () => { state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() - 1); window.updateCalendar(); };
window.nextMonth     = () => { state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + 1); window.updateCalendar(); };
window.currentMonth  = () => { state.currentCalendarDate = new Date(); window.updateCalendar(); };
