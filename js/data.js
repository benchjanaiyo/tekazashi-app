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
    /* memo列を追加して export → import で内容が消えないようにする */
    const rows = [
        ['日付', '名前', '施光時間（分）', '施光の種類', '施光場所', 'メモ', '記録日時'],
        ...[...state.records].sort((a, b) => b.date.localeCompare(a.date))
            .map(r => [r.date, r.person, r.playTime || '', r.types || '', r.location || '',
                r.memo || '', new Date(r.timestamp).toLocaleString('ja-JP')])
    ];
    downloadCSV(rows, '施光記録_' + getToday() + '.csv');
};

window.exportReceiveToCSV = function () {
    /* memo列を追加して export → import で内容が消えないようにする */
    const rows = [
        ['日付', '施光者', '受光時間（分）', '受光内容', '場所', 'メモ', '記録日時'],
        ...[...state.receiveRecords].sort((a, b) => b.date.localeCompare(a.date))
            .map(r => [r.date, r.person, r.receiveTime || '', r.types || '', r.location || '',
                r.memo || '', new Date(r.timestamp).toLocaleString('ja-JP')])
    ];
    downloadCSV(rows, '受光記録_' + getToday() + '.csv');
};

/* CSV1フィールドを安全にエスケープする
 * - " は "" に変換（RFC4180準拠）
 * - 先頭が = + - @ TAB CR の場合は ' を前置（CSVインジェクション/DDE対策） */
function escapeCSVField(value) {
    let s = (value === null || value === undefined) ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}

/* CSVの行配列をBOM付きファイルとしてダウンロードする
 * 改行はCRLF（RFC4180準拠）、各フィールドは escapeCSVField でエンコード */
function downloadCSV(rows, filename) {
    const csv  = rows.map(r => r.map(escapeCSVField).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ===================== CSVインポート ===================== */

window.importCSV = function (type) {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.csv';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        let text = await file.text();
        /* BOMを除去（先頭にあれば）— RFC4180でUTF-8 CSVには付くことが多い */
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const allRows = parseCSV(text);
        if (allRows.length < 2) { alert('データがありません'); return; }

        /* ヘッダ行をスキップ。空行は parseCSV 側で除外済み */
        const rows = allRows.slice(1);

        /* CSVインジェクション対策で先頭に ' を付けていた場合は剥がす */
        const stripQuote = s => (typeof s === 'string' && s.startsWith("'")) ? s.slice(1) : s;

        showLoading(true);
        let added = 0, skipped = 0;
        try {
            if (type === 'give') {
                for (const row of rows) {
                    const date     = stripQuote(row[0]);
                    const person   = stripQuote(row[1]);
                    const playTime = stripQuote(row[2]);
                    const types    = stripQuote(row[3]);
                    const location = stripQuote(row[4]);
                    /* memo列はバージョン互換のため任意。旧形式（5列）でも動く */
                    const memo     = stripQuote(row[5] !== undefined && !looksLikeTimestamp(row[5]) ? row[5] : '');
                    if (!date || !person) continue;
                    /* 日付・名前・種類・場所が全一致する場合のみスキップ */
                    const exists = state.records.some(r =>
                        r.date === date && r.person === person &&
                        (r.types || '') === (types || '') && (r.location || '') === (location || ''));
                    if (exists) { skipped++; continue; }
                    const newRecord = {
                        uid: state.currentUser.uid, person, date,
                        playTime: playTime || null, types: types || '',
                        location: location || '', memo: memo || '',
                        timestamp: new Date().toISOString()
                    };
                    const docRef = await addDoc(collection(db, 'records'), newRecord);
                    state.records.push({ ...newRecord, id: docRef.id });
                    if (location) saveLocationHistory(location);
                    added++;
                }
            } else {
                for (const row of rows) {
                    const date        = stripQuote(row[0]);
                    const person      = stripQuote(row[1]);
                    const receiveTime = stripQuote(row[2]);
                    const types       = stripQuote(row[3]);
                    const location    = stripQuote(row[4]);
                    /* memo列はバージョン互換のため任意。旧形式（5列）でも動く */
                    const memo        = stripQuote(row[5] !== undefined && !looksLikeTimestamp(row[5]) ? row[5] : '');
                    if (!date || !person) continue;
                    const exists = state.receiveRecords.some(r =>
                        r.date === date && r.person === person &&
                        (r.types || '') === (types || '') && (r.location || '') === (location || ''));
                    if (exists) { skipped++; continue; }
                    const newRecord = {
                        uid: state.currentUser.uid, person, date,
                        receiveTime: receiveTime || null, types: types || '', location: location || '',
                        memo: memo || '', timestamp: new Date().toISOString()
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

/* CSV全体をパースする（複数行フィールド対応・RFC4180準拠）
 * 旧 parseCSVLine は quote 内の改行を扱えず壊れていたため置換。
 * 戻り値: 行ごとの配列（各行はフィールド配列） */
function parseCSV(text) {
    const rows = [];
    let row   = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(field); field = '';
            } else if (ch === '\r') {
                /* CRLFのCRは捨てる（次のLFで行確定） */
            } else if (ch === '\n') {
                row.push(field); field = '';
                if (row.some(f => f !== '')) rows.push(row);
                row = [];
            } else {
                field += ch;
            }
        }
    }
    /* 最後の行（末尾改行なし） */
    if (field !== '' || row.length > 0) {
        row.push(field);
        if (row.some(f => f !== '')) rows.push(row);
    }
    return rows;
}

/* 旧形式CSV（memo列なし）の判定用：
 * row[5] が「2024/1/2 10:00:00」のような日時に見えればタイムスタンプと見なし memo は空扱いにする */
function looksLikeTimestamp(s) {
    if (!s) return false;
    return /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(s);
}
