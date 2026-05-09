/* ============================================================
 * memos.js — 人別メモ（施光メモ）の管理
 *
 * C言語の「メモ帳モジュール」に相当する。
 * Firestoreの personMemos コレクションの追加・編集・削除と、
 * 施光履歴表示を含む「📋 履歴」モーダルを担当する。
 * ============================================================ */

import { db, state }                   from './config.js';
import { showLoading, getToday }       from './utils.js';
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

        const date = document.createElement('div');
        date.className   = 'history-date';
        date.textContent = r.date;
        div.appendChild(date);

        const right = document.createElement('div');
        right.style.flex = '1';
        const tags = document.createElement('div');
        tags.className = 'history-tags';
        if (r.playTime) tags.appendChild(makeMemoTag('⏱ ' + r.playTime + '分'));
        if (r.types)    tags.appendChild(makeMemoTag(r.types, 'bl'));
        if (r.location) tags.appendChild(makeMemoTag('📍 ' + r.location, 'gn'));
        right.appendChild(tags);
        if (r.memo) {
            const memoBox = document.createElement('div');
            memoBox.style.cssText = 'font-size:13px;color:var(--gray-600);margin-top:4px;padding:4px 6px;background:#fef9c3;border-radius:6px;white-space:pre-wrap;word-break:break-word;';
            memoBox.textContent   = '📝 ' + r.memo;
            right.appendChild(memoBox);
        }
        div.appendChild(right);

        list.appendChild(div);
    });
}

/* タグ要素を生成（textContent ベースなのでXSS安全） */
function makeMemoTag(text, variant) {
    const span = document.createElement('span');
    span.className   = 'tag' + (variant ? ' ' + variant : '');
    span.textContent = text;
    return span;
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

        const inner = document.createElement('div');
        inner.className = 'memo-item-inner';

        const content = document.createElement('div');
        content.className = 'memo-item-content';
        const dateSpan = document.createElement('span');
        dateSpan.className   = 'memo-date';
        dateSpan.textContent = memo.memoDate;
        const textP = document.createElement('p');
        textP.className   = 'memo-text';
        textP.textContent = memo.text;
        content.appendChild(dateSpan);
        content.appendChild(textP);

        const actions = document.createElement('div');
        actions.className = 'memo-item-actions';
        const editBtn = document.createElement('button');
        editBtn.className   = 'icon-btn';
        editBtn.textContent = '✏️';
        editBtn.addEventListener('click', () => window.editMemoItem(memo.id));
        const delBtn = document.createElement('button');
        delBtn.className   = 'icon-btn danger';
        delBtn.textContent = '🗑️';
        delBtn.addEventListener('click', () => window.deleteMemo(memo.id, personName));
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        inner.appendChild(content);
        inner.appendChild(actions);
        div.appendChild(inner);
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
