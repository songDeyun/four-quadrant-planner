/* Offline daily journal storage and dated HTML exports. */
(function (root) {
  'use strict';
  const PREFIX = 'quadrantDaily.v1.';
  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function validDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00');
    return !Number.isNaN(+d) && dayKey(d) === value;
  }
  function validate(entries) {
    if (!Array.isArray(entries)) throw new Error('总结数据格式不正确');
    const seen = new Set();
    return entries.map(e => {
      if (!e || !validDay(e.date) || typeof e.text !== 'string' || seen.has(e.date)) throw new Error('总结日期或内容不正确');
      seen.add(e.date);
      return { date: e.date, text: e.text, updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : '' };
    });
  }
  function entries(storage) {
    const result = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key.startsWith(PREFIX)) continue;
      const record = JSON.parse(storage.getItem(key));
      validate([record]);
      if (record.date !== key.slice(PREFIX.length)) throw new Error('总结记录的日期不一致');
      if (record.text.trim()) result.push(record);
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }
  function put(storage, date, text) {
    const record = { date, text, updatedAt: new Date().toISOString() };
    validate([record]);
    storage.setItem(PREFIX + date, JSON.stringify(record));
    return record;
  }
  function ordered(records) {
    return validate(records).filter(e => e.text.trim()).sort((a, b) => b.date.localeCompare(a.date));
  }
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function html(records) {
    const rows = ordered(records);
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>总结记录</title><style>body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;background:#f5f7fb;color:#172033;margin:0;padding:32px 20px}main{max-width:880px;margin:auto}h1{font-size:28px}header p{color:#7b8798}article{background:white;border-radius:14px;padding:24px;margin:20px 0;box-shadow:0 8px 24px #17203308}h2{font-size:19px;margin:0 0 18px;color:#387bd0}.content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9}@media print{body{background:white;padding:0}article{box-shadow:none;border-radius:0;padding:12px 0}h2{break-after:avoid}}</style></head><body><main><header><h1>总结记录</h1><p>最新日期在前 · 共 ${rows.length} 天</p></header>${rows.map(entry => `<article><h2>${entry.date}</h2><div class="content">${escapeHtml(entry.text)}</div></article>`).join('')}</main></body></html>`;
  }
  const api = { PREFIX, dayKey, validDay, validate, entries, put, html };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DailyCore = api;
})(typeof window === 'undefined' ? globalThis : window);
