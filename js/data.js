/* ============================================================
 * data.js — CSVエクスポート・インポート
 *
 * C言語の「ファイルI/Oモジュール」に相当する。
 * ⚙️設定モーダルから呼ばれる。
 * エクスポート：records/receiveRecords → CSVファイルダウンロード
 * インポート  ：CSVファイル選択 → Firestore に追加（重複スキップ）
 * ============================================================ */

import { db, state }                   from './config.js';
import { showLoading, saveLocationHistory, getToday } from './utils.js';
import { collection, addDoc }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===================== CSVエクスポート ===================== */

window.exportToCSV = function () {
    const rows = [
        ['日付', '名前', '施光時間（分）', '施光の種類', '施光場所', '記録日時'],
        ...[...state.records].sort((a, b) => b.date.localeCompare(a.date))
            .map(r => [r.date, r.person, r.playTime || '', r.types || '', r.location || '',
                new Date(r.timestamp).toLocaleString('ja-JP')])
    ];
    downloadCSV(rows, '施光記録_' + getToday() + '.csv');
};

window.exportReceiveToCSV = function () {
    const rows = [
        ['日付', '施光者', '受光時間（分）', '受光内容', '場所', '記録日時'],
        ...[...state.receiveRecords].sort((a, b) => b.date.localeCompare(a.date))
            .map(r => [r.date, r.person, r.receiveTime || '', r.types || '', r.location || '',
                new Date(r.timestamp).toLocaleString('ja-JP')])
    ];
    downloadCSV(rows, '受光記録_' + getToday() + '.csv');
};

/* CSVの行配列をBOM付きファイルとしてダウンロードする */
function downloadCSV(rows, filename) {
    const csv  = rows.map(r => r.map(f => '"' + f + '"').join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

/* ===================== CSVインポート ===================== */

window.importCSV = function (type) {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.csv';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        const text  = await file.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) { alert('データがありません'); return; }

        /* BOMを除去してヘッダ行をスキップ */
        lines[0].replace(/^﻿/, '');
        const rows = lines.slice(1).map(l => parseCSVLine(l));

        showLoading(true);
        let added = 0, skipped = 0;
        try {
            if (type === 'give') {
                for (const row of rows) {
                    const [date, person, playTime, types, location] = row;
                    if (!date || !person) continue;
                    /* 日付・名前・種類・場所が全一致する場合のみスキップ */
                    const exists = state.records.some(r =>
                        r.date === date && r.person === person &&
                        (r.types || '') === (types || '') && (r.location || '') === (location || ''));
                    if (exists) { skipped++; continue; }
                    const newRecord = {
                        uid: state.currentUser.uid, person, date,
                        playTime: playTime || null, types: types || '', location: location || '',
                        timestamp: new Date().toISOString()
                    };
                    const docRef = await addDoc(collection(db, 'records'), newRecord);
                    state.records.push({ ...newRecord, id: docRef.id });
                    if (location) saveLocationHistory(location);
                    added++;
                }
            } else {
                for (const row of rows) {
                    const [date, person, receiveTime, types, location] = row;
                    if (!date || !person) continue;
                    const exists = state.receiveRecords.some(r =>
                        r.date === date && r.person === person &&
                        (r.types || '') === (types || '') && (r.location || '') === (location || ''));
                    if (exists) { skipped++; continue; }
                    const newRecord = {
                        uid: state.currentUser.uid, person, date,
                        receiveTime: receiveTime || null, types: types || '', location: location || '',
                        timestamp: new Date().toISOString()
                    };
                    const docRef = await addDoc(collection(db, 'receiveRecords'), newRecord);
                    state.receiveRecords.push({ ...newRecord, id: docRef.id });
                    if (location) saveLocationHistory(location);
                    added++;
                }
            }
            window.updateDisplay();
            alert(`インポート完了\n追加: ${added}件\nスキップ（重複）: ${skipped}件`);
        } catch (e) { alert('インポートに失敗しました: ' + e.message); }
        showLoading(false);
    };
    input.click();
};

/* CSVの1行を配列に変換（ダブルクォート・カンマ対応） */
function parseCSVLine(line) {
    const result = [];
    let current  = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current); current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}
