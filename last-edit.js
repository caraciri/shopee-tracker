(() => {
  'use strict';

  const STORE = 'meta_shopee_tracker_v4';
  const SHEETS_KEY = 'meta_shopee_sheets_data_v4';
  const IGNORE_KEYS = new Set(['createdAt', 'updatedAt', 'synced', 'source']);
  let editingId = null;
  let internalWrite = false;

  function parse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  function rowKey(row) {
    return String(row?.rowId || row?.id || '');
  }

  function stripMeta(row) {
    const copy = {};
    Object.keys(row || {}).sort().forEach((key) => {
      if (!IGNORE_KEYS.has(key)) copy[key] = row[key];
    });
    return JSON.stringify(copy);
  }

  function normalizeList(key, nextList) {
    if (!Array.isArray(nextList)) return nextList;
    const now = new Date().toISOString();
    const prevList = parse(localStorage.getItem(key), []);
    const prevMap = new Map(prevList.map((row) => [rowKey(row), row]));

    return nextList.map((row) => {
      const id = rowKey(row);
      const prev = prevMap.get(id);
      const changed = prev && stripMeta(prev) !== stripMeta(row);
      const isNew = !prev;
      const isEdited = id && editingId && id === editingId;

      if (!prev && key === SHEETS_KEY) {
        return { ...row };
      }

      return {
        ...row,
        createdAt: row.createdAt || prev?.createdAt || (isNew ? now : ''),
        updatedAt: isNew ? '' : (isEdited || changed ? now : (row.updatedAt || prev?.updatedAt || ''))
      };
    });
  }

  const nativeSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function patchedSetItem(key, value) {
    if (internalWrite || (key !== STORE && key !== SHEETS_KEY)) {
      return nativeSetItem(key, value);
    }

    const list = parse(value, null);
    if (!Array.isArray(list)) return nativeSetItem(key, value);

    internalWrite = true;
    try {
      return nativeSetItem(key, JSON.stringify(normalizeList(key, list)));
    } finally {
      internalWrite = false;
    }
  };

  function formatDateTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function csvDateTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function patchTable() {
    const table = document.querySelector('#table table');
    if (!table) return;

    table.querySelectorAll('.last-edit-head,.last-edit-cell').forEach((element) => element.remove());

    table.querySelectorAll('tbody tr').forEach((row) => {
      const actionCell = row.lastElementChild;
      const editButton = row.querySelector('[data-edit]');
      if (!actionCell || !editButton || actionCell.querySelector('.last-edit-inline')) return;

      const payload = parse(editButton.dataset.edit, {});
      const text = formatDateTime(payload.updatedAt);
      if (!text) return;

      const info = document.createElement('div');
      info.className = 'last-edit-inline';
      info.textContent = 'Edit: ' + text;
      actionCell.appendChild(info);
    });
  }

  function combinedData() {
    const local = parse(localStorage.getItem(STORE), []);
    const sheets = parse(localStorage.getItem(SHEETS_KEY), []);
    const ids = new Set(local.map(rowKey));
    return [...local, ...sheets.filter((row) => !ids.has(rowKey(row)))];
  }

  function exportCSV(event) {
    const button = event.target.closest?.('#btn-export');
    if (!button) return;

    const data = combinedData();
    if (!data.length) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const header = ['Tanggal', 'Campaign', 'Adset', 'Creative', 'Hook', 'Produk', 'Link Affiliate', 'Spend Rp', 'Komisi D0', 'Komisi D1', 'Komisi D3', 'Komisi D7', 'Total Komisi', 'Profit/Rugi Rp', 'K/S Ratio', 'Klik', 'Status', 'Catatan', 'Sumber', 'Terakhir Edit'];
    const rows = data.map((row) => {
      const spend = Number(row.spend || 0);
      const d0 = Number(row.commissionD0 ?? row.commission ?? 0) || 0;
      const d1 = Number(row.commissionD1 || 0) || 0;
      const d3 = Number(row.commissionD3 || 0) || 0;
      const d7 = Number(row.commissionD7 || 0) || 0;
      const total = Number(row.totalCommission ?? row.commission ?? (d0 + d1 + d3 + d7)) || 0;
      const values = [row.date, row.campaign, row.adset, row.creative, row.hook, row.product, row.affiliateLink, spend, d0, d1, d3, d7, total, total - spend, spend ? (total / spend).toFixed(2) : '—', row.clicks, row.status, row.note, row.source, csvDateTime(row.updatedAt)];
      return values.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',');
    });

    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tracker-iklan-shopee-last-edit.csv';
    link.click();
  }

  document.addEventListener('click', (event) => {
    const editButton = event.target.closest?.('[data-edit]');
    if (editButton) {
      const payload = parse(editButton.dataset.edit, {});
      editingId = rowKey(payload);
      return;
    }

    if (event.target.closest?.('#btn-cancel-edit')) {
      editingId = null;
      return;
    }
  }, true);

  document.addEventListener('click', exportCSV, true);

  const observer = new MutationObserver(() => requestAnimationFrame(patchTable));
  window.addEventListener('DOMContentLoaded', () => {
    const target = document.getElementById('table');
    if (target) observer.observe(target, { childList: true, subtree: true });
    patchTable();
  });
})();
