/* ============================================================
 * memos.js — 人別メモ（施光メモ）の管理
 *
 * C言語の「メモ帳モジュール」に相当する。
 * Firestoreの personMemos コレクションの追加・編集・削除と、
 * 施光履歴表示を含む「📋 履歴」モーダルを担当する。
 * ============================================================ */

import { db, state }                   from './config.js';
import { escapeHtml, showLoading,
         getToday }                    from './utils.js';
import { collection, doc, addDoc,
         updateDoc, deleteDoc }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===================== 人別メモモーダルを開く ===================== */

window.showMemoModal = function (personName) {
    document.getElementById('memo-person-name').textContent = personName;
    document.getElementById('memo-person-input').value = personName;
    document.getElementById('memo-date-input').value   = getToday();
    renderPersonHistory(personName);
    renderPersonMemos(personName);
    window.openModal('memo-modal');
};

/* 施光履歴リスト（メモモーダル上部） */
function renderPersonHistory(personName) {
    const list       = document.getElementById('person-history-list');
    const personRecs = state.records
        .filter(r => r.person === personName)
        .sort((a, b) => b.date.localeCompare(a.date));
    list.innerHTML = '';
    if (personRecs.length === 0) {
        list.innerHTML = '<p class="memo-empty">施光記録がありません</p>';
        return;
    }
    personRecs.forEach(r => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div class="history-date">${r.date}</div>
            <div style="flex:1;">
                <div class="history-tags">
                    ${r.playTime ? `<span class="tag">⏱ ${r.playTime}分</span>` : ''}
                    ${r.types    ? `<span class="tag bl">${r.types}</span>` : ''}
                    ${r.location ? `<span class="tag gn">📍 ${escapeHtml(r.location)}</span>` : ''}
                </div>
                ${r.memo ? `<div style="font-size:13px;color:var(--gray-600);margin-top:4px;padding:4px 6px;background:#fef9c3;border-radius:6px;">📝 ${escapeHtml(r.memo)}</div>` : ''}
            </div>`;
        list.appendChild(div);
    });
}

/* メモリスト（メモモーダル下部） */
function renderPersonMemos(personName) {
    const list    = document.getElementById('memo-list');
    const myMemos = state.personMemos
        .filter(m => m.person === personName)
        .sort((a, b) => b.memoDate.localeCompare(a.memoDate));
    list.innerHTML = '';
    if (myMemos.length === 0) {
        list.innerHTML = '<p class="memo-empty">メモはまだありません</p>';
        return;
    }
    myMemos.forEach(memo => {
        const div = document.createElement('div');
        div.className = 'memo-item';
        div.innerHTML = `
            <div class="memo-item-inner">
                <div class="memo-item-content">
                    <span class="memo-date">${memo.memoDate}</span>
                    <p class="memo-text">${escapeHtml(memo.text)}</p>
                </div>
                <div class="memo-item-actions">
                    <button onclick="editMemoItem('${memo.id}')" class="icon-btn">✏️</button>
                    <button onclick="deleteMemo('${memo.id}', '${escapeHtml(personName)}')" class="icon-btn danger">🗑️</button>
                </div>
            </div>`;
        list.appendChild(div);
    });
}

/* ===================== メモの保存（新規 or 更新） ===================== */

window.saveMemo = async function () {
    const person   = document.getElementById('memo-person-input').value;
    const memoDate = document.getElementById('memo-date-input').value;
    const text     = document.getElementById('memo-text-input').value.trim();
    if (!text) { alert('メモを入力してください'); return; }
    showLoading(true);
    try {
        if (state.editingMemo) {
            await updateDoc(doc(db, 'personMemos', state.editingMemo), { text, memoDate });
            state.personMemos = state.personMemos.map(m =>
                m.id === state.editingMemo ? { ...m, text, memoDate } : m);
            state.editingMemo = null;
        } else {
            const newMemo = {
                uid: state.currentUser.uid, person, text, memoDate,
                timestamp: new Date().toISOString()
            };
            const docRef = await addDoc(collection(db, 'personMemos'), newMemo);
            state.personMemos.push({ ...newMemo, id: docRef.id });
        }
        document.getElementById('memo-text-input').value = '';
        renderPersonMemos(person);
        /* updateRecentPeople() は records.js に定義されているため window 経由で呼ぶ */
        if (window.updateRecentPeopleGlobal) window.updateRecentPeopleGlobal();
    } catch (e) { alert('保存に失敗しました: ' + e.message); }
    showLoading(false);
};

window.editMemoItem = function (memoId) {
    const memo = state.personMemos.find(m => m.id === memoId);
    if (!memo) return;
    state.editingMemo = memoId;
    document.getElementById('memo-date-input').value  = memo.memoDate;
    document.getElementById('memo-text-input').value  = memo.text;
    document.getElementById('memo-text-input').focus();
};

window.deleteMemo = async function (memoId, personName) {
    if (!confirm('このメモを削除しますか？')) return;
    showLoading(true);
    try {
        await deleteDoc(doc(db, 'personMemos', memoId));
        state.personMemos = state.personMemos.filter(m => m.id !== memoId);
        renderPersonMemos(personName);
        if (window.updateRecentPeopleGlobal) window.updateRecentPeopleGlobal();
    } catch (e) { alert('削除に失敗しました: ' + e.message); }
    showLoading(false);
};

window.hideMemoModal = function () {
    document.getElementById('memo-modal').classList.add('hidden');
    state.editingMemo = null;
    document.body.style.overflow = '';
};
