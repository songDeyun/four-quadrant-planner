/* A separate module leaves the existing task store and file URL unchanged. */
(() => {
  'use strict';
  const Core = window.DailyCore, $ = id => document.getElementById(id);
  const input = $('dailyInput'), status = $('dailyStatus'), exportStatus = $('dailyExportStatus');
  let activeDay = Core.dayKey(), archiveHandle = null, archiveTimer = null;
  let writeChain = Promise.resolve();
  let noticeTimer = null, saving = false;
  let storageFailed = false;
  const setStatus = (element, text, error = false) => { element.textContent = text; element.classList.toggle('error', error); };
  function notifySave(text, error = false) {
    const notice = $('dailySaveNotice');
    clearTimeout(noticeTimer);
    notice.textContent = text;
    notice.classList.toggle('failure', error);
    notice.classList.toggle('visible', true);
    noticeTimer = setTimeout(() => notice.classList.toggle('visible', false), error ? 6000 : 3500);
  }
  const readText = date => {
    const raw = localStorage.getItem(Core.PREFIX + date);
    return raw ? Core.validate([JSON.parse(raw)])[0].text : '';
  };
  function persist() {
    try {
      Core.put(localStorage, activeDay, input.value);
      storageFailed = false;
      setStatus(status, '已自动保存到本机');
      renderArchive();
      scheduleArchive();
      return true;
    } catch (error) {
      storageFailed = true;
      setStatus(status, '本机保存失败，请先一键保存文件或复制内容，暂不切换日期', true);
      return false;
    }
  }
  function rollover() {
    const today = Core.dayKey();
    if (today === activeDay) return;
    // Never clear the old editor unless its record has been persisted.
    if (!persist()) return;
    const next = readText(today);
    activeDay = today;
    input.value = next;
    $('dailyDate').textContent = activeDay;
    setStatus(status, next ? '已读取今天的总结' : '新的一天，写下今天的总结');
    renderArchive();
  }
  function renderArchive() {
    const select = $('dailyHistory'), previous = select.value;
    const rows = Core.entries(localStorage).filter(e => e.date !== activeDay).reverse();
    select.replaceChildren(new Option('选择日期查看历史总结', ''));
    for (const row of rows) select.add(new Option(row.date, row.date));
    if (rows.some(row => row.date === previous)) select.value = previous;
    $('dailyHistoryText').textContent = select.value ? readText(select.value) : '历史总结会按日期保留，不会随第二天的空白编辑区一起删除。';
    $('dailyHistoryCount').textContent = `已记录 ${Core.entries(localStorage).length} 天`;
  }
  function archiveRows() {
    const rows = Core.entries(localStorage).filter(e => e.date !== activeDay);
    if (input.value.trim()) rows.push({ date: activeDay, text: input.value });
    return rows;
  }
  function scheduleArchive() {
    if (!archiveHandle) return;
    clearTimeout(archiveTimer);
    archiveTimer = setTimeout(writeArchive, 1000);
  }
  function rememberHandle(value) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('QuadrantHtmlArchive', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('settings', value ? 'readwrite' : 'readonly');
        const action = value ? tx.objectStore('settings').put(value, 'archive') : tx.objectStore('settings').get('archive');
        let result;
        action.onsuccess = () => { result = action.result; };
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }
  function writeArchive(showNotice = false) {
    if (!archiveHandle) return Promise.resolve();
    const target = archiveHandle;
    writeChain = writeChain.then(async () => {
      if (await target.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        setStatus(exportStatus, '总结仍保留在程序里；请点击“保存总结记录”恢复文件写入权限。');
        if (showNotice) notifySave('保存未完成：请先允许文件写入', true);
        return;
      }
      const text = Core.html(archiveRows());
      const writer = await target.createWritable();
      try { await writer.write(text); await writer.close(); }
      catch (error) { await writer.abort().catch(() => {}); throw error; }
      setStatus(exportStatus, `保存成功：${target.name} · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`);
      if (showNotice) notifySave(`✓ 保存成功，已更新 ${target.name}`);
    }).catch(() => {
      setStatus(exportStatus, 'HTML 文件未更新，本机总结仍保留。请检查文件是否被占用，再点击“保存总结记录”。', true);
      if (showNotice) notifySave('保存失败：请检查文件占用或写入权限', true);
    });
    return writeChain;
  }
  async function saveArchive() {
    if (saving) return;
    saving = true;
    const button = $('downloadDaily');
    button.disabled = true;
    button.textContent = '保存中…';
    clearTimeout(noticeTimer);
    $('dailySaveNotice').textContent = '';
    $('dailySaveNotice').classList.toggle('visible', false);
    persist();
    try {
      if (!archiveRows().length) { setStatus(exportStatus, '尚无总结内容，填写后即可保存。'); notifySave('请先填写总结，再保存'); return; }
      if (!('showSaveFilePicker' in window)) {
        downloadBackup();
        return;
      }
      if (!archiveHandle) {
        archiveHandle = await window.showSaveFilePicker({ suggestedName: '总结记录.html', types: [{ description: '总结记录 HTML', accept: { 'text/html': ['.html'] } }] });
        try { await rememberHandle(archiveHandle); } catch (error) { /* Saving works for this session even when handle persistence is unavailable. */ }
      } else if (await archiveHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        if (await archiveHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
          setStatus(exportStatus, '未获得文件写入权限，本机总结仍保留。');
          notifySave('保存未完成：未获得文件写入权限', true); return;
        }
      }
      clearTimeout(archiveTimer);
      await writeArchive(true);
    } catch (error) {
      if (error.name !== 'AbortError') {
        setStatus(exportStatus, '文件保存失败，请重试；本机记录仍在，可到历史记录页面备份数据。', true);
        notifySave('保存失败，请重试或备份数据', true);
      } else {
        setStatus(exportStatus, '已取消文件保存，本机总结仍保留。');
      }
    } finally {
      saving = false;
      button.disabled = false;
      button.textContent = '保存总结记录';
    }
  }
  function downloadBackup() {
    persist();
    try {
      const rows = archiveRows();
      if (!rows.length) { setStatus(exportStatus, '尚无总结内容，填写后即可保存。'); return; }
      const url = URL.createObjectURL(new Blob(['\ufeff', Core.html(rows)], { type: 'text/html;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = '总结记录.html'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus(exportStatus, '已发起完整记录下载；如要继续使用原文件，请在保存位置选择原文件并确认替换。');
    } catch (error) { setStatus(exportStatus, '导出失败，请先复制总结内容：' + error.message, true); }
  }
  input.addEventListener('input', () => { persist(); rollover(); });
  $('dailyHistory').addEventListener('change', () => { $('dailyHistoryText').textContent = $('dailyHistory').value ? readText($('dailyHistory').value) : '选择日期查看历史总结。'; });
  $('downloadDaily').onclick = saveArchive;
  window.addEventListener('focus', rollover);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rollover(); });
  window.addEventListener('pagehide', () => { persist(); });
  window.addEventListener('beforeunload', event => { if (storageFailed) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage', event => {
    if (!event.key || !event.key.startsWith(Core.PREFIX)) return;
    if (event.key === Core.PREFIX + activeDay) input.value = readText(activeDay);
    renderArchive();
    scheduleArchive();
  });
  setInterval(rollover, 1000);
  $('dailyDate').textContent = activeDay;
  try { input.value = readText(activeDay); renderArchive(); }
  catch (error) { setStatus(status, '读取总结失败，请保留浏览器数据并导出备份。', true); }
  if ('showSaveFilePicker' in window) {
    rememberHandle().then(async value => {
      if (!value || archiveHandle) return;
      archiveHandle = value;
      if (await value.queryPermission({ mode: 'readwrite' }) === 'granted') await writeArchive();
      else setStatus(exportStatus, `已记住归档文件 ${value.name}，点击“保存总结记录”继续更新。`);
    }).catch(() => {});
  }
  window.DailyJournal = {
    entries: () => Core.entries(localStorage), persist,
    restored: () => { input.value = readText(activeDay); renderArchive(); scheduleArchive(); },
    writeArchive
  };
})();
