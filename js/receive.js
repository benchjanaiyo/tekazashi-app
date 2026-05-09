/* ============================================================
 * receive.js — 受光記録のCRUD + 画面表示
 *
 * C言語の「受光レコード管理モジュール」に相当する。
 * Firestoreの receiveRecords コレクションへの追加・更新・削除と、
 * 受光タブ内の今日の記録リスト・人名サジェストを担当する。
 * ============================================================ */

import { db, state }                         from './config.js';
import { getSelectedTypes,
         clearReceiveInputs, saveLocationHistory,
         showLoading, convertToHalfWidth }   from './utils.js';
import { collection, doc, addDoc,
         updateDoc, deleteDoc }              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===================== 受光記録の追加 ===================== */

window.addReceiveRecord = async function () {
    const personName   = document.getElementById('receive-person').value.trim();
    let   receiveTime  = convertToHalfWidth(document.getElementById('receive-time').value).trim();
    const selectedDate = document.getElementById('receive-selected-date').value;
    const types        = getSelectedTypes('receive-type');
    const location     = document.getElementById('receive-location').value.trim();
    const memo         = document.getElementById('receive-memo').value.trim();
    if (!personName || !selectedDate) { alert('名前と日付を入力してください'); return; }
    if (receiveTime && !/^\d+$/.test(receiveTime)) {
        alert('受光時間は数字で入力してください'); return;
    }
    showLoading(true);
    try {
        const newRecord = {
            uid: state.currentUser.uid, person: personName, date: selectedDate,
            receiveTime: receiveTime || null, types: types || '',
            location: location || '', memo: memo || '',
            timestamp: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'receiveRecords'), newRecord);
        state.receiveRecords.push({ ...newRecord, id: docRef.id });
        clearReceiveInputs();
        window.updateDisplay();
        if (location) saveLocationHistory(location);
    } catch (e) { alert('保存に失敗しました: ' + e.message); }
    showLoading(false);
};

/* ===================== 受光記録の削除 ===================== */

window.deleteReceiveRecord = async function (recordId) {
    if (!confirm('この受光記録を削除しますか？')) return;
    showLoading(true);
    try {
        await deleteDoc(doc(db, 'receiveRecords', recordId));
        state.receiveRecords = state.receiveRecords.filter(r => r.id !== recordId);
        window.updateDisplay();
    } catch (e) { alert('削除に失敗しました: ' + e.message); }
    showLoading(false);
};

/* ===================== 受光記録の編集 ===================== */

window.editReceiveRecord = function (record) {
    state.editingReceiveRecord = record;
    document.getElementById('edit-receive-person').value   = record.person;
    document.getElementById('edit-receive-date').value     = record.date;
    document.getElementById('edit-receive-time').value     = record.receiveTime || '';
    document.getElementById('edit-receive-location').value = record.location || '';
    document.getElementById('edit-receive-type-custom').value = '';
    ['edit-receive-type-8', 'edit-receive-type-7', 'edit-receive-type-6', 'edit-receive-type-1'].forEach(id =>
        document.getElementById(id).checked = false);
    if (record.types) {
        /* 既知タイプを順にチェック→残りをすべて custom 扱いに（空白を含む custom 入力に対応） */
        const known = { '⑧': 'edit-receive-type-8', '⑦': 'edit-receive-type-7', '⑥': 'edit-receive-type-6', '①': 'edit-receive-type-1' };
        const tokens = record.types.split(' ');
        const remain = [];
        tokens.forEach(t => {
            if (known[t]) document.getElementById(known[t]).checked = true;
            else if (t)   remain.push(t);
        });
        if (remain.length) document.getElementById('edit-receive-type-custom').value = remain.join(' ');
    }
    document.getElementById('edit-receive-memo').value = record.memo || '';
    window.openModal('edit-receive-modal');
};

window.updateReceiveRecord = async function () {
    if (!state.editingReceiveRecord) return;
    let receiveTime = convertToHalfWidth(document.getElementById('edit-receive-time').value).trim();
    const person = document.getElementById('edit-receive-person').value.trim();
    const date   = document.getElementById('edit-receive-date').value;
    if (!person || !date) { alert('名前と日付を入力してください'); return; }
    if (receiveTime && !/^\d+$/.test(receiveTime)) {
        alert('受光時間は数字で入力してください'); return;
    }
    const updated = {
        person, date,
        receiveTime: receiveTime || null,
        types:       getSelectedTypes('edit-receive-type'),
        location:    document.getElementById('edit-receive-location').value.trim(),
        memo:        document.getElementById('edit-receive-memo').value.trim()
    };
    showLoading(true);
    try {
        await updateDoc(doc(db, 'receiveRecords', state.editingReceiveRecord.id), updated);
        state.receiveRecords = state.receiveRecords.map(r =>
            r.id === state.editingReceiveRecord.id ? { ...r, ...updated } : r);
        window.updateDisplay();
        window.hideEditReceiveModal();
    } catch (e) { alert('更新に失敗しました: ' + e.message); }
    showLoading(false);
};

window.hideEditReceiveModal = function () {
    document.getElementById('edit-receive-modal').classList.add('hidden');
    state.editingReceiveRecord = null;
    document.body.style.overflow = '';
};

/* ===================== 今日の受光記録リスト ===================== */

window.updateTodaysReceiveRecords = function () {
    const selectedDate  = document.getElementById('receive-selected-date').value;
    const todaysRecords = state.receiveRecords.filter(r => r.date === selectedDate);
    const container = document.getElementById('todays-receive-records');
    const list      = document.getElementById('receive-records-list');
    const title     = document.getElementById('receive-records-title');
    if (todaysRecords.length > 0) {
        container.classList.remove('hidden');
        title.textContent = selectedDate + 'の受光';
        list.innerHTML = '';
        /* records.js の buildRecordCard を再利用してXSSを根絶 */
        todaysRecords.forEach(record => {
            list.appendChild(window._buildRecordCard(record, 'receive'));
        });
    } else {
        container.classList.add('hidden');
    }
};

/* ===================== 受光の人名サジェスト ===================== */

/* 受光記録の人名だけを候補として使用する（施光記録とは分離） */
export function setupReceivePersonSuggest() {
    const input   = document.getElementById('receive-person');
    const suggest = document.getElementById('receive-person-suggest');

    function getPersonList() {
        const people = [...new Set(state.receiveRecords.map(r => r.person))];
        return people.sort((a, b) => {
            const ca = state.receiveRecords.filter(r => r.person === a).length;
            const cb = state.receiveRecords.filter(r => r.person === b).length;
            return cb - ca;
        });
    }

    function renderSuggest() {
        const val      = input.value.trim();
        const all      = getPersonList();
        const filtered = val ? all.filter(n => n.includes(val)) : all;
        if (filtered.length === 0) { suggest.classList.add('hidden'); return; }
        suggest.innerHTML = '';
        filtered.forEach(name => {
            const div = document.createElement('div');
            div.className = 'suggest-item';
            div.textContent = name;
            div.onclick = () => { input.value = name; suggest.classList.add('hidden'); };
            suggest.appendChild(div);
        });
        suggest.classList.remove('hidden');
    }

    input.addEventListener('focus', renderSuggest);
    input.addEventListener('input', renderSuggest);
    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !suggest.contains(e.target))
            suggest.classList.add('hidden');
    });

    window._refreshReceivePersonSuggest = () => {};
}
