/* ============================================================
 * records.js — 施光記録のCRUD + 画面表示
 *
 * C言語の「施光レコード管理モジュール」に相当する。
 * Firestoreの records コレクションへの追加・更新・削除と、
 * 施光タブ内の今日の記録リスト・よく施光する人チップを担当する。
 * ============================================================ */

import { db, state }                        from './config.js';
import { escapeHtml, getSelectedTypes,
         clearInputs, saveLocationHistory,
         showLoading, convertToHalfWidth }  from './utils.js';
import { collection, doc, addDoc,
         updateDoc, deleteDoc }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===================== 施光記録の追加 ===================== */

window.addNewPerson = async function () {
    const personName   = document.getElementById('person-name').value.trim();
    let   playTime     = convertToHalfWidth(document.getElementById('play-time').value);
    const selectedDate = document.getElementById('selected-date').value;
    const types        = getSelectedTypes('type');
    const location     = document.getElementById('location').value.trim();
    const memo         = document.getElementById('give-memo').value.trim();
    if (!personName || !selectedDate) { alert('名前と日付を入力してください'); return; }

    /* 同日同名が既存なら重複確認モーダルを表示 */
    const isDuplicate = state.records.some(r => r.person === personName && r.date === selectedDate);
    if (isDuplicate) {
        state.duplicateInfo = { person: personName, date: selectedDate, playTime, types, location, memo };
        document.getElementById('duplicate-message').textContent =
            selectedDate + 'に' + personName + 'さんの記録が既に存在します。それでも追加しますか？';
        window.openModal('duplicate-modal');
        return;
    }
    await addRecord(personName, playTime, selectedDate, types, location, memo);
    clearInputs();
};

async function addRecord(person, playTime, date, types, location, memo) {
    showLoading(true);
    try {
        const newRecord = {
            uid: state.currentUser.uid, person, date,
            playTime: playTime || null, types: types || '',
            location: location || '', memo: memo || '',
            timestamp: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'records'), newRecord);
        state.records.push({ ...newRecord, id: docRef.id });
        window.updateDisplay();
        if (location) saveLocationHistory(location);
    } catch (e) { alert('保存に失敗しました: ' + e.message); }
    showLoading(false);
}

window.confirmDuplicate = async function () {
    if (state.duplicateInfo) {
        const { person, playTime, date, types, location, memo } = state.duplicateInfo;
        await addRecord(person, playTime, date, types, location, memo);
        clearInputs();
    }
    window.hideDuplicateModal();
};

/* ===================== 施光記録の削除 ===================== */

window.deleteRecord = async function (recordId) {
    if (!confirm('この記録を削除しますか？')) return;
    showLoading(true);
    try {
        await deleteDoc(doc(db, 'records', recordId));
        state.records = state.records.filter(r => r.id !== recordId);
        window.updateDisplay();
    } catch (e) { alert('削除に失敗しました: ' + e.message); }
    showLoading(false);
};

/* ===================== 施光記録の編集 ===================== */

window.editRecord = function (record) {
    state.editingRecord = record;
    document.getElementById('edit-person').value   = record.person;
    document.getElementById('edit-date').value     = record.date;
    document.getElementById('edit-playtime').value = record.playTime || '';
    document.getElementById('edit-location').value = record.location || '';
    document.getElementById('edit-type-custom').value = '';
    ['edit-type-8', 'edit-type-7', 'edit-type-6', 'edit-type-1', 'edit-type-mikunite'].forEach(id =>
        document.getElementById(id).checked = false);
    if (record.types) {
        record.types.split(' ').forEach(t => {
            if      (t === '⑧')    document.getElementById('edit-type-8').checked = true;
            else if (t === '⑦')    document.getElementById('edit-type-7').checked = true;
            else if (t === '⑥')    document.getElementById('edit-type-6').checked = true;
            else if (t === '①')    document.getElementById('edit-type-1').checked = true;
            else if (t === '未組手') document.getElementById('edit-type-mikunite').checked = true;
            else if (t)             document.getElementById('edit-type-custom').value = t;
        });
    }
    window.openModal('edit-modal');
};

window.updateRecord = async function () {
    if (!state.editingRecord) return;
    let playTime = convertToHalfWidth(document.getElementById('edit-playtime').value);
    const updated = {
        person:   document.getElementById('edit-person').value,
        date:     document.getElementById('edit-date').value,
        playTime: playTime || null,
        types:    getSelectedTypes('edit-type'),
        location: document.getElementById('edit-location').value.trim()
    };
    showLoading(true);
    try {
        await updateDoc(doc(db, 'records', state.editingRecord.id), updated);
        state.records = state.records.map(r => r.id === state.editingRecord.id ? { ...r, ...updated } : r);
        window.updateDisplay();
        window.hideEditModal();
    } catch (e) { alert('更新に失敗しました: ' + e.message); }
    showLoading(false);
};

window.hideEditModal = function () {
    document.getElementById('edit-modal').classList.add('hidden');
    state.editingRecord = null;
    document.body.style.overflow = '';
};

window.hideDuplicateModal = function () {
    document.getElementById('duplicate-modal').classList.add('hidden');
    state.duplicateInfo = null;
    document.body.style.overflow = '';
};

/* ===================== 今日の施光記録リスト ===================== */

window.updateTodaysGiveRecords = function () {
    const selectedDate  = document.getElementById('selected-date').value;
    const todaysRecords = state.records.filter(r => r.date === selectedDate);
    const container = document.getElementById('todays-give-records');
    const list      = document.getElementById('give-records-list');
    const title     = document.getElementById('give-records-title');
    if (todaysRecords.length > 0) {
        container.classList.remove('hidden');
        title.textContent = selectedDate + 'の施光';
        list.innerHTML = '';
        todaysRecords.forEach(record => {
            const div = document.createElement('div');
            div.className = 'record-card give';
            div.innerHTML = `
                <div class="record-info">
                    <span class="record-name">${escapeHtml(record.person)}</span>
                    <div class="record-tags">
                        ${record.playTime  ? `<span class="tag">⏱ ${record.playTime}分</span>` : ''}
                        ${record.types     ? `<span class="tag blue">${record.types}</span>` : ''}
                        ${record.location  ? `<span class="tag green">📍 ${escapeHtml(record.location)}</span>` : ''}
                    </div>
                </div>
                <div class="record-actions">
                    <button class="icon-btn edit-give-btn">✏️</button>
                    <button onclick="deleteRecord('${record.id}')" class="icon-btn danger">🗑️</button>
                </div>`;
            div.querySelector('.edit-give-btn').addEventListener('click', () => window.editRecord(record));
            list.appendChild(div);
        });
    } else {
        container.classList.add('hidden');
    }
};

/* ===================== よく施光する人チップ ===================== */

export function updateRecentPeople() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentCounts  = {};
    state.records.forEach(r => {
        if (r.date >= thirtyDaysAgo) recentCounts[r.person] = (recentCounts[r.person] || 0) + 1;
    });
    const allPeople = [...new Set(state.records.map(r => r.person))];
    const sorted    = allPeople.map(n => ({ name: n, count: recentCounts[n] || 0 }))
        .sort((a, b) => b.count - a.count);
    const div = document.getElementById('recent-people');
    if (!div) return;
    div.innerHTML = '';
    sorted.forEach(({ name, count }) => {
        const myMemoCount = state.personMemos.filter(m => m.person === name).length;
        const latestMemo  = state.personMemos.filter(m => m.person === name)
            .sort((a, b) => b.memoDate.localeCompare(a.memoDate))[0];
        const wrapper = document.createElement('div');
        wrapper.className = 'person-chip-wrapper';
        const btn = document.createElement('button');
        btn.className = 'person-chip';
        btn.innerHTML = escapeHtml(name) +
            (count > 0 ? `<span class="chip-count" title="過去30日の施光回数">${count}回</span>` : '');
        btn.onclick = () => { document.getElementById('person-name').value = name; };
        const memoBtn = document.createElement('button');
        memoBtn.className = 'memo-chip' + (myMemoCount > 0 ? ' has-memo' : '');
        memoBtn.title     = latestMemo
            ? latestMemo.memoDate + ': ' + latestMemo.text.substring(0, 30)
            : 'メモ・履歴を見る';
        memoBtn.textContent = '📝' + (myMemoCount > 0 ? myMemoCount : '');
        memoBtn.onclick = e => { e.stopPropagation(); window.showMemoModal(name); };
        wrapper.appendChild(btn);
        wrapper.appendChild(memoBtn);
        div.appendChild(wrapper);
    });
}

/* ===================== 施光履歴モーダル ===================== */

window.showHistoryModal = function (personName) {
    document.getElementById('history-person-name').textContent = personName + ' さんの施光履歴';
    const personRecords = state.records
        .filter(r => r.person === personName)
        .sort((a, b) => b.date.localeCompare(a.date));
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    if (personRecords.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#9ca3af;padding:20px;font-size:14px;">記録がありません</p>';
    } else {
        personRecords.forEach(r => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div class="history-date">${r.date}</div>
                <div class="history-tags">
                    ${r.playTime  ? `<span class="tag">⏱ ${r.playTime}分</span>` : ''}
                    ${r.types     ? `<span class="tag bl">${r.types}</span>` : ''}
                    ${r.location  ? `<span class="tag gn">📍 ${escapeHtml(r.location)}</span>` : ''}
                </div>`;
            list.appendChild(div);
        });
    }
    window.openModal('history-modal');
};

window.hideHistoryModal = function () {
    document.getElementById('history-modal').classList.add('hidden');
    document.body.style.overflow = '';
};

window.checkHistoryFromInput = function () {
    const name = document.getElementById('person-name').value.trim();
    if (!name) return;
    window.showMemoModal(name);
};
