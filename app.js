(() => {
  'use strict';

  const STORE = 'meta_shopee_tracker_v4';
  const URL = 'meta_shopee_script_url';
  const SHEETS = 'meta_shopee_sheets_data_v4';
  const TOKEN = 'meta_shopee_secret_token';
  const LIMIT = 10;

  let entries = parse(localStorage.getItem(STORE), []);
  let sheets = parse(localStorage.getItem(SHEETS), []);
  let scriptUrl = localStorage.getItem(URL) || '';
  let secret = localStorage.getItem(TOKEN) || '';
  let range = '7days';
  let showAll = false;
  let chart = null;
  let editing = null;

  const $ = (id) => document.getElementById(id);
  const ids = ['campaign', 'adset', 'creative', 'hook', 'product', 'link', 'spend', 'd0', 'd1', 'd3', 'd7', 'clicks', 'note'];

  function parse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function today(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function uuid() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'row_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (match) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[match]));
  }

  function money(value) {
    return 'Rp ' + Math.round(Number(value) || 0).toLocaleString('id-ID');
  }

  function short(value) {
    const number = Number(value) || 0;
    const abs = Math.abs(number);
    const formatted = abs >= 1000000 ? (abs / 1000000).toFixed(1) + ' jt' : abs >= 1000 ? (abs / 1000).toFixed(0) + ' rb' : Math.round(abs) + '';
    return (number < 0 ? '-' : '') + 'Rp ' + formatted;
  }

  function val(id) {
    return $(id).value.trim();
  }

  function num(id) {
    return Number.parseFloat($(id).value) || 0;
  }

  function dte(value) {
    return value ? new Date(value + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  }

  function decide(spend, commission) {
    const ratio = spend > 0 ? commission / spend : 0;
    const profit = commission - spend;
    if (spend < 50000) return 'WATCH';
    if (ratio >= 1.5 && profit > 0) return 'SCALE';
    if (ratio >= 1) return 'HOLD';
    return 'KILL';
  }

  function cls(status) {
    return { SCALE: 'scale', HOLD: 'hold', WATCH: 'watch', KILL: 'kill' }[status] || 'watch';
  }

  function norm(entry) {
    const d0 = Number(entry.commissionD0 ?? entry.commission ?? 0) || 0;
    const d1 = Number(entry.commissionD1 || 0) || 0;
    const d3 = Number(entry.commissionD3 || 0) || 0;
    const d7 = Number(entry.commissionD7 || 0) || 0;
    const total = Number(entry.totalCommission ?? entry.commission ?? (d0 + d1 + d3 + d7)) || 0;
    const spend = Number(entry.spend || 0) || 0;

    return {
      ...entry,
      id: entry.id || entry.rowId || uuid(),
      rowId: entry.rowId || entry.id || '',
      date: entry.date || today(),
      campaign: entry.campaign || '',
      adset: entry.adset || '',
      creative: entry.creative || '',
      hook: entry.hook || '',
      product: entry.product || '—',
      affiliateLink: entry.affiliateLink || '',
      spend,
      commissionD0: d0,
      commissionD1: d1,
      commissionD3: d3,
      commissionD7: d7,
      commission: total,
      totalCommission: total,
      profit: total - spend,
      ratio: spend > 0 ? total / spend : 0,
      clicks: Number(entry.clicks || 0) || 0,
      status: entry.status || decide(spend, total),
      note: entry.note || '',
      source: entry.source || 'local',
      synced: Boolean(entry.synced)
    };
  }

  function init() {
    $('date').value = today();
    $('end').value = today();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    $('start').value = today(startDate);

    if (scriptUrl) {
      $('url').value = scriptUrl;
      $('history-card').style.display = 'block';
      $('btn-close').style.display = 'inline-flex';
      if (secret) {
        $('token').value = secret;
        badge('connected');
      } else {
        badge('error', 'Token belum diisi');
      }
    }

    on('btn-test', saveTest);
    on('btn-close', () => $('setup').style.display = 'none');
    on('btn-add', submit);
    on('btn-cancel-edit', cancelEdit);
    on('btn-load', loadSheets);
    on('btn-clear', clearSheets);
    on('btn-retry', retry);
    on('btn-export', exportCSV);
    on('btn-reset', reset);
    ['filter-product', 'filter-campaign', 'filter-source'].forEach((id) => on(id, render, 'change'));
    document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setRange(button.dataset.range, button)));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.id && ['url', 'token'].indexOf(event.target.id) < 0) submit();
    });
    render();
  }

  function on(id, handler, event = 'click') {
    $(id).addEventListener(event, handler);
  }

  function toast(message, type = 'info') {
    const element = $('toast');
    element.textContent = message;
    element.className = `toast ${type} show`;
    setTimeout(() => element.classList.remove('show'), 2800);
  }

  function badge(state, label) {
    $('sync-badge').className = 'sync-badge ' + state;
    $('sync-label').textContent = label || ({ connected: 'Terhubung ke Sheets', error: 'Gagal terhubung', syncing: 'Menyimpan...', '': 'Belum terhubung' }[state] || 'Belum terhubung');
  }

  function token() {
    return (secret || localStorage.getItem(TOKEN) || '').trim();
  }

  async function post(data) {
    const currentToken = token();
    if (!currentToken) throw new Error('Token belum diisi');
    const response = await fetch(scriptUrl, {
      method: 'POST',
      body: JSON.stringify({ ...data, token: currentToken }),
      headers: { 'Content-Type': 'text/plain' }
    });
    const json = await response.json();
    if (json.status !== 'ok') throw new Error(json.message || 'Gagal');
    return json;
  }

  async function saveTest() {
    const url = val('url');
    const inputToken = val('token');
    if (!url.includes('script.google.com')) return toast('⚠ URL tidak valid', 'error');
    if (!inputToken) return toast('⚠ Isi token dulu', 'error');

    scriptUrl = url;
    secret = inputToken;
    badge('syncing', 'Menguji koneksi...');

    try {
      await post({ action: 'test' });
      localStorage.setItem(URL, scriptUrl);
      localStorage.setItem(TOKEN, secret);
      $('history-card').style.display = 'block';
      $('btn-close').style.display = 'inline-flex';
      badge('connected');
      toast('✓ Berhasil terhubung', 'success');
      retry();
    } catch (error) {
      badge('error', 'Gagal terhubung');
      toast('✕ ' + error.message, 'error');
    }
  }

  function setRange(nextRange, button) {
    range = nextRange;
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    $('custom').classList.toggle('show', nextRange === 'custom');
    const selected = getRange();
    if (nextRange !== 'custom') {
      $('start').value = selected.start;
      $('end').value = selected.end;
    }
  }

  function getRange() {
    const now = new Date();
    const end = today(now);
    if (range === 'today') return { start: end, end };
    if (range === 'yesterday') {
      const date = new Date(now);
      date.setDate(date.getDate() - 1);
      const yesterday = today(date);
      return { start: yesterday, end: yesterday };
    }
    if (range === '7days') {
      const date = new Date(now);
      date.setDate(date.getDate() - 6);
      return { start: today(date), end };
    }
    if (range === '30days') {
      const date = new Date(now);
      date.setDate(date.getDate() - 29);
      return { start: today(date), end };
    }
    if (range === 'thismonth') return { start: today(new Date(now.getFullYear(), now.getMonth(), 1)), end };
    return { start: $('start').value || end, end: $('end').value || end };
  }

  async function loadSheets() {
    if (!scriptUrl) return toast('⚠ Belum terhubung', 'error');
    const currentToken = token();
    if (!currentToken) return toast('⚠ Token belum diisi', 'error');

    const { start, end } = getRange();
    const status = $('load-status');
    const button = $('btn-load');
    button.disabled = true;
    button.textContent = '↻ Memuat...';
    status.textContent = 'Mengambil data...';
    badge('syncing', 'Memuat histori...');

    try {
      const response = await fetch(`${scriptUrl}?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&token=${encodeURIComponent(currentToken)}`);
      const json = await response.json();
      if (json.status !== 'ok') throw new Error(json.message || 'Gagal fetch');
      sheets = (json.data || []).map(norm);
      localStorage.setItem(SHEETS, JSON.stringify(sheets));
      showAll = false;
      render();
      badge('connected');
      status.textContent = `✓ ${sheets.length} data dimuat`;
      toast('✓ Data dimuat', 'success');
    } catch (error) {
      badge('error', 'Gagal load');
      status.textContent = '✕ ' + error.message;
      toast('✕ ' + error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = '↓ Muat Data dari Sheets';
    }
  }

  function clearSheets() {
    sheets = [];
    localStorage.removeItem(SHEETS);
    showAll = false;
    render();
    toast('Cache Sheets dihapus', 'info');
  }

  function formEntry() {
    const entry = norm({
      id: editing?.id || uuid(),
      rowId: editing?.rowId || '',
      date: val('date'),
      campaign: val('campaign'),
      adset: val('adset'),
      creative: val('creative'),
      hook: val('hook'),
      product: val('product') || '—',
      affiliateLink: val('link'),
      spend: num('spend'),
      commissionD0: num('d0'),
      commissionD1: num('d1'),
      commissionD3: num('d3'),
      commissionD7: num('d7'),
      clicks: parseInt(val('clicks'), 10) || 0,
      note: val('note'),
      source: editing?.source || 'local',
      synced: false
    });
    if (!entry.rowId) entry.rowId = entry.id;
    return entry;
  }

  async function submit() {
    const entry = formEntry();
    if (!entry.date) return toast('⚠ Pilih tanggal', 'error');
    if (entry.spend <= 0 && entry.totalCommission <= 0) return toast('⚠ Isi spend atau komisi', 'error');
    if (editing) return updateEntry(entry);

    entries.push(entry);
    entries.sort((a, b) => a.date.localeCompare(b.date));
    save();
    clearForm();
    showAll = false;
    render();

    if (scriptUrl) {
      const button = $('btn-add');
      button.disabled = true;
      button.textContent = '↻ Menyimpan...';
      badge('syncing');
      try {
        await post(entry);
        entry.synced = true;
        save();
        render();
        badge('connected');
        toast('✓ Data tersimpan', 'success');
      } catch (error) {
        badge('error', 'Gagal sync');
        toast('⚠ Lokal tersimpan, sync gagal: ' + error.message, 'error');
      } finally {
        button.disabled = false;
        button.textContent = '+ Tambah & Sync';
      }
    } else {
      toast('✓ Data disimpan lokal', 'info');
    }
  }

  async function updateEntry(entry) {
    if (!entry.rowId) return toast('⚠ rowId tidak ditemukan', 'error');
    entry.synced = false;
    const id = entry.rowId || entry.id;
    let found = false;

    entries = entries.map((item) => {
      if ((item.rowId || item.id) === id) {
        found = true;
        return entry;
      }
      return item;
    });

    sheets = sheets.map((item) => {
      if ((item.rowId || item.id) === id) {
        found = true;
        return { ...entry, source: 'sheets', synced: true };
      }
      return item;
    });

    if (!found && entry.source !== 'sheets') entries.push(entry);
    save();
    localStorage.setItem(SHEETS, JSON.stringify(sheets));
    render();

    if (scriptUrl) {
      const button = $('btn-add');
      button.disabled = true;
      button.textContent = '↻ Mengupdate...';
      badge('syncing', 'Mengupdate data...');
      try {
        await post({ ...entry, action: 'update' });
        entries = entries.map((item) => (item.rowId || item.id) === id ? { ...item, synced: true } : item);
        save();
        badge('connected');
        toast('✓ Data berhasil diupdate', 'success');
        cancelEdit(false);
        render();
      } catch (error) {
        badge('error', 'Gagal update');
        toast('⚠ Update lokal, sync gagal: ' + error.message, 'error');
      } finally {
        button.disabled = false;
        if (editing) $('btn-add').textContent = 'Update Data';
      }
    } else {
      toast('✓ Data lokal diupdate', 'info');
      cancelEdit(false);
    }
  }

  function beginEdit(entry) {
    editing = norm(entry);
    $('date').value = editing.date;
    setVal('campaign', editing.campaign);
    setVal('adset', editing.adset);
    setVal('creative', editing.creative);
    setVal('hook', editing.hook);
    setVal('product', editing.product === '—' ? '' : editing.product);
    setVal('link', editing.affiliateLink);
    setVal('spend', editing.spend);
    setVal('d0', editing.commissionD0);
    setVal('d1', editing.commissionD1);
    setVal('d3', editing.commissionD3);
    setVal('d7', editing.commissionD7);
    setVal('clicks', editing.clicks);
    setVal('note', editing.note);
    $('btn-add').textContent = 'Update Data';
    $('btn-cancel-edit').style.display = 'block';
    $('edit-banner').classList.add('show');
    $('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setVal(id, value) {
    $(id).value = value ?? '';
  }

  function cancelEdit(clear = true) {
    editing = null;
    $('btn-add').textContent = '+ Tambah & Sync';
    $('btn-cancel-edit').style.display = 'none';
    $('edit-banner').classList.remove('show');
    if (clear) clearForm();
  }

  function clearForm() {
    ids.forEach((id) => $(id).value = '');
  }

  async function retry() {
    if (!scriptUrl) return;
    const list = entries.filter((entry) => !entry.synced);
    if (!list.length) return renderUnsync();
    badge('syncing', `Sync ${list.length} data...`);
    let ok = 0;
    for (const entry of list) {
      try {
        await post(norm(entry));
        entry.synced = true;
        ok++;
      } catch {}
    }
    save();
    render();
    badge(ok === list.length ? 'connected' : 'error');
    toast(`Sync ${ok}/${list.length}`, ok === list.length ? 'success' : 'error');
  }

  function renderUnsync() {
    const count = entries.filter((entry) => !entry.synced && scriptUrl).length;
    $('unsync-count').textContent = count;
    $('unsync').style.display = count ? 'flex' : 'none';
  }

  async function del(entry, source) {
    if (!confirm(`Hapus ${source === 'sheets' ? 'data Sheets' : 'data lokal'} ini?\nTanggal: ${entry.date} | Produk: ${entry.product}`)) return;
    const id = entry.rowId || entry.id;
    if (source !== 'sheets') {
      entries = entries.filter((item) => (item.rowId || item.id) !== id);
      save();
    }
    if (source === 'sheets') {
      sheets = sheets.filter((item) => (item.rowId || item.id) !== id);
      localStorage.setItem(SHEETS, JSON.stringify(sheets));
    }
    render();
    if (!scriptUrl) return toast('✓ Data dihapus dari tampilan', 'info');

    try {
      badge('syncing', 'Menghapus...');
      const json = await post({ action: 'delete', rowId: id, date: entry.date, product: entry.product, spend: entry.spend, commission: entry.totalCommission, clicks: entry.clicks, note: entry.note });
      badge('connected');
      toast(json.deleted ? '✓ Data dihapus' : '⚠ Baris tidak ditemukan', json.deleted ? 'success' : 'info');
    } catch (error) {
      badge('error', 'Gagal hapus');
      toast('⚠ ' + error.message, 'error');
    }
  }

  function reset() {
    if (!confirm('Reset semua data lokal dan cache Sheets?\nData di Google Sheets TIDAK ikut terhapus.')) return;
    entries = [];
    sheets = [];
    editing = null;
    save();
    localStorage.removeItem(SHEETS);
    render();
    toast('Data lokal & cache direset', 'info');
  }

  function save() {
    localStorage.setItem(STORE, JSON.stringify(entries));
  }

  function allData() {
    const local = entries.map(norm);
    const ids = new Set(local.map((entry) => entry.rowId || entry.id));
    const onlySheets = sheets.map(norm).filter((entry) => !ids.has(entry.rowId || entry.id));
    return [...local, ...onlySheets].sort((a, b) => a.date.localeCompare(b.date));
  }

  function filtered() {
    let data = allData();
    const product = $('filter-product').value;
    const campaign = $('filter-campaign').value;
    const source = $('filter-source').value;
    if (product) data = data.filter((entry) => entry.product === product);
    if (campaign) data = data.filter((entry) => entry.campaign === campaign);
    if (source === 'local') data = data.filter((entry) => entry.source === 'local' || !entry.source);
    if (source === 'sheets') data = data.filter((entry) => entry.source === 'sheets');
    return data;
  }

  function filters() {
    const data = allData();
    sel('filter-product', [...new Set(data.map((entry) => entry.product).filter((product) => product && product !== '—'))], 'Semua produk');
    sel('filter-campaign', [...new Set(data.map((entry) => entry.campaign).filter(Boolean))], 'Semua campaign');
  }

  function sel(id, items, label) {
    const element = $(id);
    const current = element.value;
    element.innerHTML = `<option value="">${label}</option>`;
    items.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (value === current) option.selected = true;
      element.appendChild(option);
    });
  }

  function render() {
    filters();
    renderUnsync();
    const data = filtered();
    metrics(data);
    ranks(data);
    table(data);
    draw(data);
    $('summary').style.display = data.length ? 'block' : 'none';
  }

  function metrics(data) {
    if (!data.length) return;
    const spend = data.reduce((sum, entry) => sum + entry.spend, 0);
    const commission = data.reduce((sum, entry) => sum + entry.totalCommission, 0);
    const profit = commission - spend;
    const ratio = spend ? commission / spend : 0;
    const days = new Set(data.map((entry) => entry.date)).size;
    const clicks = data.reduce((sum, entry) => sum + entry.clicks, 0);
    const roi = spend ? (profit / spend) * 100 : 0;
    const verdictClass = spend === 0 ? 'neutral' : ratio >= 1.5 ? 'good' : ratio >= 1 ? 'warn' : 'bad';
    const verdictText = spend === 0 ? 'Tambah data spend iklan untuk melihat analisis.' : ratio >= 1.5 ? `K/S Ratio ${ratio.toFixed(2)}x, kandidat scale. Profit ${short(profit)}.` : ratio >= 1 ? `K/S Ratio ${ratio.toFixed(2)}x, hampir impas. Optimasi creative/adset.` : `K/S Ratio ${ratio.toFixed(2)}x, masih boncos ${short(Math.abs(profit))}.`;

    $('verdict').innerHTML = `<div class="verdict ${verdictClass}">${verdictText}</div>`;
    $('metrics').innerHTML = `<div class="metric info"><div class="ml">Total Spend</div><div class="mv blue">${short(spend)}</div><div class="ms">${days} hari · ${data.length} baris</div></div><div class="metric"><div class="ml">Total Komisi D0-D7</div><div class="mv">${short(commission)}</div><div class="ms">Atribusi 7 hari</div></div><div class="metric ${profit >= 0 ? 'good' : 'bad'}"><div class="ml">Profit / Rugi</div><div class="mv ${profit >= 0 ? 'green' : 'red'}">${profit >= 0 ? '+' : ''}${short(profit)}</div><div class="ms">ROI: ${spend ? roi.toFixed(1) + '%' : '—'}</div></div><div class="metric"><div class="ml">K/S Ratio</div><div class="mv ${ratio >= 1.5 ? 'green' : ratio >= 1 ? 'amber' : 'red'}">${spend ? ratio.toFixed(2) + 'x' : '—'}</div><div class="ms">Komisi / spend</div></div><div class="metric"><div class="ml">Klik</div><div class="mv">${clicks.toLocaleString('id-ID')}</div><div class="ms">CPC: ${clicks ? money(spend / clicks) : '—'}</div></div>`;
  }

  function group(data, key) {
    const map = new Map();
    data.forEach((entry) => {
      const name = entry[key] || '—';
      const item = map.get(name) || { name, spend: 0, comm: 0, profit: 0 };
      item.spend += entry.spend;
      item.comm += entry.totalCommission;
      item.profit += entry.totalCommission - entry.spend;
      map.set(name, item);
    });
    return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, 5);
  }

  function rank(title, rows) {
    if (!rows.length) return '';
    return `<div style="margin-bottom:16px"><div class="ml" style="margin-bottom:8px">${title}</div><div class="scroll"><table><thead><tr><th>Nama</th><th class="num">Spend</th><th class="num">Komisi</th><th class="num">Profit</th><th class="num">K/S</th></tr></thead><tbody>${rows.map((item) => { const ratio = item.spend ? item.comm / item.spend : 0; return `<tr><td>${esc(item.name)}</td><td class="num">${money(item.spend)}</td><td class="num">${money(item.comm)}</td><td class="profit ${item.profit >= 0 ? 'pos' : 'neg'}">${item.profit >= 0 ? '+' : ''}${money(item.profit)}</td><td class="ratio ${ratio >= 1.5 ? 'great' : ratio >= 1 ? 'ok' : 'bad'}">${ratio.toFixed(2)}x</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }

  function ranks(data) {
    $('rank').innerHTML = `<div class="title">Ranking cepat</div>${rank('Top Campaign', group(data, 'campaign'))}${rank('Top Adset', group(data, 'adset'))}${rank('Top Creative', group(data, 'creative'))}`;
  }

  function table(data) {
    if (!data.length) {
      $('table').innerHTML = '<div class="empty">Belum ada data. Tambahkan data di atas atau muat dari Sheets.</div>';
      return;
    }
    const total = data.length;
    const visible = showAll ? data : data.slice(-LIMIT);
    const rows = [...visible].reverse().map((entry) => {
      const profit = entry.totalCommission - entry.spend;
      const ratio = entry.spend ? entry.totalCommission / entry.spend : 0;
      const source = entry.source || 'local';
      const payload = esc(JSON.stringify(entry));
      return `<tr><td>${dte(entry.date)}${entry.inputTime ? `<br><span style="font-size:9px;color:var(--m)">${esc(entry.inputTime)}</span>` : ''}</td><td><span class="badge tag">${esc(entry.campaign || '—')}</span><br><span style="font-size:10px;color:var(--m)">${esc(entry.adset || '—')}</span></td><td><span class="badge tag">${esc(entry.creative || '—')}</span><br><span style="font-size:10px;color:var(--m)">${esc(entry.hook || '—')}</span></td><td><span class="badge product">${esc(entry.product)}</span> <span class="source ${source === 'sheets' ? 'sheets' : 'local'}">${source === 'sheets' ? 'Sheets' : 'Lokal'}</span></td><td class="num">${money(entry.spend)}</td><td class="num">${money(entry.commissionD0)}</td><td class="num">${money(entry.commissionD1)}</td><td class="num">${money(entry.commissionD3)}</td><td class="num">${money(entry.commissionD7)}</td><td class="num">${money(entry.totalCommission)}</td><td class="profit ${profit >= 0 ? 'pos' : 'neg'}">${profit >= 0 ? '+' : ''}${money(profit)}</td><td class="ratio ${ratio >= 1.5 ? 'great' : ratio >= 1 ? 'ok' : 'bad'}">${ratio.toFixed(2)}x</td><td><span class="decision ${cls(entry.status)}">${esc(entry.status)}</span></td><td class="num">${entry.clicks ? entry.clicks.toLocaleString('id-ID') : '—'}</td><td style="white-space:nowrap;text-align:center"><button class="btn btn-xs btn-edit" data-edit='${payload}'>Edit</button> <button class="btn btn-xs btn-danger" data-del='${payload}' data-source="${esc(source)}">Hapus</button></td></tr>`;
    }).join('');
    const footer = total > LIMIT ? `<div class="table-foot"><span>Menampilkan ${visible.length} dari ${total} baris data</span><button class="btn btn-sm" id="toggle-history">${showAll ? 'Tampilkan 10 terakhir' : 'Tampilkan semua'}</button></div>` : `<div class="table-foot"><span>Menampilkan ${total} baris data</span></div>`;

    $('table').innerHTML = `<div class="scroll"><table><thead><tr><th>Tanggal</th><th>Campaign / Adset</th><th>Creative / Hook</th><th>Produk</th><th class="num">Spend</th><th class="num">D0</th><th class="num">D1</th><th class="num">D3</th><th class="num">D7</th><th class="num">Total</th><th class="num">Profit</th><th class="num">K/S</th><th>Status</th><th class="num">Klik</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div>${footer}`;
    document.querySelectorAll('[data-edit]').forEach((button) => button.onclick = () => beginEdit(JSON.parse(button.dataset.edit)));
    document.querySelectorAll('[data-del]').forEach((button) => button.onclick = () => del(JSON.parse(button.dataset.del), button.dataset.source));
    const toggle = $('toggle-history');
    if (toggle) toggle.onclick = () => {
      showAll = !showAll;
      table(filtered());
    };
  }

  function draw(data) {
    if (!data.length || !window.Chart) return;
    const labels = [];
    const spend = [];
    const commission = [];
    const profit = [];
    let spendTotal = 0;
    let commissionTotal = 0;

    data.forEach((entry) => {
      spendTotal += entry.spend;
      commissionTotal += entry.totalCommission;
      labels.push(new Date(entry.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
      spend.push(spendTotal);
      commission.push(commissionTotal);
      profit.push(commissionTotal - spendTotal);
    });

    const dataset = {
      labels,
      datasets: [
        { label: 'Spend', data: spend, borderColor: '#2d5be3', backgroundColor: 'rgba(45,91,227,.06)', fill: true, tension: .35 },
        { label: 'Komisi', data: commission, borderColor: '#1a7a52', backgroundColor: 'rgba(26,122,82,.06)', fill: true, tension: .35 },
        { label: 'Profit/Rugi', data: profit, borderColor: profit[profit.length - 1] < 0 ? '#b83232' : '#1a7a52', fill: true, tension: .35, borderDash: [5, 3] }
      ]
    };

    if (chart) {
      chart.data = dataset;
      chart.update();
      return;
    }

    chart = new Chart($('chart').getContext('2d'), {
      type: 'line',
      data: dataset,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: (value) => short(value).replace('Rp ', '') } } }
      }
    });
  }

  function exportCSV() {
    const data = allData();
    if (!data.length) return toast('⚠ Tidak ada data', 'error');
    const header = ['Tanggal', 'Campaign', 'Adset', 'Creative', 'Hook', 'Produk', 'Link Affiliate', 'Spend Rp', 'Komisi D0', 'Komisi D1', 'Komisi D3', 'Komisi D7', 'Total Komisi', 'Profit/Rugi Rp', 'K/S Ratio', 'Klik', 'Status', 'Catatan', 'Sumber'];
    const rows = data.map((entry) => [entry.date, entry.campaign, entry.adset, entry.creative, entry.hook, entry.product, entry.affiliateLink, entry.spend, entry.commissionD0, entry.commissionD1, entry.commissionD3, entry.commissionD7, entry.totalCommission, entry.totalCommission - entry.spend, entry.spend ? (entry.totalCommission / entry.spend).toFixed(2) : '—', entry.clicks, entry.status, entry.note, entry.source].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tracker-iklan-shopee-v15.csv';
    link.click();
    toast('✓ CSV didownload', 'success');
  }

  init();
})();
