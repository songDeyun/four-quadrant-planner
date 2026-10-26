const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
process.env.TZ = 'Asia/Shanghai';
const Core = require('../web/daily-core.js');

class Storage {
  constructor() { this.map = new Map(); this.fail = false; }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i]; }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw Error('quota'); this.map.set(key, value); }
  removeItem(key) { this.map.delete(key); }
}

function browser(storage) {
  let clock = new Date('2026-10-26T23:59:59'), interval;
  const nodes = new Map(), events = {}, downloads = [], blobs = new Map(), timers = new Map();
  let nextTimer = 0;
  class Element {
    constructor() {
      this.value = ''; this.textContent = ''; this.children = []; this.handlers = {};
      this.classList = { toggle() {} }; this.hidden = false;
    }
    addEventListener(name, callback) { this.handlers[name] = callback; }
    add(option) { this.children.push(option); }
    replaceChildren(...children) { this.children = children; this.value = ''; }
    click() { if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) }); this.onclick?.(); }
  }
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [+clock])); }
    static now() { return +clock; }
  }
  const window = {
    DailyCore: Core,
    addEventListener(name, callback) { events[name] = callback; }
  };
  const context = vm.createContext({ window, localStorage: storage, Date: Clock, Blob, URL: { createObjectURL(blob) { const url = 'blob:' + blobs.size; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); },
      addEventListener() {}, createElement() { return new Element(); } },
    Option: function (text, value) { this.text = text; this.value = value; },
    setInterval(fn) { interval = fn; }, setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    indexedDB: {}, console
  });
  // Core.dayKey must use the same fake clock as the UI.
  const coreSource = fs.readFileSync(path.join(__dirname, '../web/daily-core.js'), 'utf8');
  context.TextEncoder = TextEncoder;
  vm.runInContext(coreSource, context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/daily.js'), 'utf8'), context);
  return {
    window, nodes, events, downloads,
    async flushArchive() { const list = [...timers.entries()].filter(([, t]) => t.delay === 1000); for (const [id, t] of list) { timers.delete(id); await t.fn(); } },
    type(text) { const node = nodes.get('dailyInput'); node.value = text; node.handlers.input(); },
    tick(date) { clock = new Date(date); interval(); }
  };
}

(async () => {
  assert.equal(Core.dayKey(new Date('2026-10-26T00:30:00+08:00')), '2026-10-26');
  assert.equal(Core.validDay('2026-02-30'), false);
  assert.equal(Core.validDay('2028-02-29'), true);
  assert.throws(() => Core.validate([{ date: 'invalid', text: 'x' }]));
  assert.throws(() => Core.validate([{ date: '2026-01-01', text: 'x' }, { date: '2026-01-01', text: 'y' }]));
  const storage = new Storage();
  storage.setItem('quadrantTasks', '[{"id":"keep","title":"原有计划"}]');
  let ui = browser(storage);
  ui.type('完成论文修改\n明天继续阅读文献。\n符号：<&> 😀');
  assert.equal(Core.entries(storage).length, 1);
  ui.tick('2026-10-27T00:00:01');
  assert.equal(ui.nodes.get('dailyInput').value, '');
  assert.equal(Core.entries(storage)[0].date, '2026-10-26');
  ui.type('今天的新总结');
  assert.equal(Core.entries(storage).length, 2);
  assert.equal(Core.entries(storage)[0].text.startsWith('完成论文'), true);
  // Simulate restart and restore the same day's summary.
  const restarted = browser(storage);
  assert.equal(restarted.nodes.get('dailyInput').value, Core.entries(storage)[0].text);
  restarted.tick('2026-10-27T09:00:00');
  assert.equal(restarted.nodes.get('dailyInput').value, '今天的新总结');
  assert.equal(storage.getItem('quadrantTasks'), '[{"id":"keep","title":"原有计划"}]');
  restarted.type('存储失败时不要丢弃我的总结');
  storage.fail = true;
  restarted.tick('2026-10-28T00:00:00');
  assert.equal(restarted.nodes.get('dailyInput').value, '存储失败时不要丢弃我的总结');
  assert.match(restarted.nodes.get('dailyStatus').textContent, /保存失败/);
  storage.fail = false;
  restarted.tick('2026-10-28T00:00:01');
  assert.equal(restarted.nodes.get('dailyInput').value, '');

  // Saving again must overwrite the same cumulative file, with one section per date.
  let written = '', picks = 0, grants = 0, permission = 'granted', locked = false;
  let failClose = false, closeGate = null, onClose = null, allowGrant = true;
  ui.window.showSaveFilePicker = async () => {
    picks++;
    return { name: '总结记录.html', queryPermission: async () => permission,
      requestPermission: async () => { grants++; permission = allowGrant ? 'granted' : 'denied'; return permission; },
      createWritable: async () => {
        if (locked) throw Error('locked');
        return { write: async value => { written = value; }, close: async () => {
          if (onClose) onClose();
          if (closeGate) await closeGate;
          if (failClose) throw Error('close failed');
        }, abort: async () => {} };
      }
    };
  };
  await ui.nodes.get('downloadDaily').onclick();
  assert.equal(picks, 1);
  assert.match(ui.nodes.get('dailySaveNotice').textContent, /✓ 保存成功/);
  assert.match(ui.nodes.get('dailyExportStatus').textContent, /保存成功/);
  assert.equal(ui.nodes.get('downloadDaily').disabled, false);
  assert.ok(written.includes('2026-10-26') && written.includes('2026-10-27'));
  assert.ok(written.indexOf('2026-10-26') < written.indexOf('2026-10-27'));
  ui.type('同一天的新版总结');
  await ui.nodes.get('downloadDaily').onclick();
  assert.equal(picks, 1);
  assert.equal((written.match(/<h2>2026-10-27<\/h2>/g) || []).length, 1);
  assert.ok(written.includes('同一天的新版总结'));
  assert.ok(!written.includes('今天的新总结'));
  ui.tick('2026-10-28T00:00:01');
  await ui.flushArchive();
  assert.ok(written.includes('2026-10-26') && written.includes('2026-10-27'));
  assert.ok(!written.includes('2026-10-28'));
  ui.type('第三天的总结');
  await ui.flushArchive();
  assert.ok(written.indexOf('2026-10-27') < written.indexOf('2026-10-28'));
  assert.equal(picks, 1);
  permission = 'prompt';
  await ui.nodes.get('downloadDaily').onclick();
  assert.equal(grants, 1);
  assert.equal(picks, 1);
  locked = true;
  await ui.nodes.get('downloadDaily').onclick();
  assert.match(ui.nodes.get('dailyExportStatus').textContent, /本机总结仍保留/);
  assert.match(ui.nodes.get('dailySaveNotice').textContent, /保存失败/);
  assert.ok(!ui.nodes.get('dailySaveNotice').textContent.includes('保存成功'));
  locked = false;
  failClose = true;
  await ui.nodes.get('downloadDaily').onclick();
  assert.match(ui.nodes.get('dailySaveNotice').textContent, /保存失败/);
  failClose = false;
  let releaseClose;
  closeGate = new Promise(resolve => { releaseClose = resolve; });
  const closing = new Promise(resolve => { onClose = resolve; });
  const pendingSave = ui.nodes.get('downloadDaily').onclick();
  await closing;
  assert.equal(ui.nodes.get('dailySaveNotice').textContent, '');
  assert.equal(ui.nodes.get('downloadDaily').textContent, '保存中…');
  assert.equal(ui.nodes.get('downloadDaily').disabled, true);
  releaseClose();
  await pendingSave;
  assert.match(ui.nodes.get('dailySaveNotice').textContent, /✓ 保存成功/);
  assert.equal(ui.nodes.get('downloadDaily').disabled, false);
  closeGate = null; onClose = null;
  permission = 'prompt'; allowGrant = false;
  await ui.nodes.get('downloadDaily').onclick();
  assert.match(ui.nodes.get('dailySaveNotice').textContent, /未获得文件写入权限/);
  permission = 'granted'; allowGrant = true;
  const fallbackUi = browser(storage);
  await fallbackUi.nodes.get('downloadDaily').onclick();
  assert.equal(fallbackUi.downloads.at(-1).name, '总结记录.html');
  assert.ok(!fallbackUi.nodes.get('dailySaveNotice').textContent.includes('保存成功'));
  const allHtml = await fallbackUi.downloads.at(-1).blob.text();
  assert.ok(allHtml.indexOf('2026-10-26') < allHtml.indexOf('2026-10-27'));
  assert.ok(Core.html([{ date: '2026-10-26', text: '<script>alert(1)</script>' }]).includes('&lt;script&gt;'));
  const emptyUi = browser(new Storage());
  await emptyUi.nodes.get('downloadDaily').onclick();
  assert.equal(emptyUi.downloads.length, 0);
  assert.ok(!emptyUi.nodes.get('dailySaveNotice').textContent.includes('保存成功'));
  const cancelUi = browser(storage);
  cancelUi.window.showSaveFilePicker = async () => { const error = Error('cancel'); error.name = 'AbortError'; throw error; };
  await cancelUi.nodes.get('downloadDaily').onclick();
  assert.equal(cancelUi.nodes.get('dailySaveNotice').textContent, '');
  assert.match(cancelUi.nodes.get('dailyExportStatus').textContent, /已取消/);
  assert.equal(cancelUi.nodes.get('downloadDaily').disabled, false);
  const fullStorage = new Storage(), fullUi = browser(fullStorage);
  fullStorage.fail = true;
  fullUi.type('没有保存成功也可以导出');
  await fullUi.nodes.get('downloadDaily').onclick();
  assert.ok((await fullUi.downloads[0].blob.text()).includes('没有保存成功也可以导出'));
  const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  const inline = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  new vm.Script(inline);
  assert.ok(html.includes('id="dailyInput"'));
  assert.ok(html.includes('dailySummaries:'));
  assert.ok(!html.includes('id="downloadDailyHtml"'));
  assert.ok(!html.includes('下载完整记录'));
  // Exercise the actual backup importer, including compatibility and date merge rules.
  const backupStorage = new Storage(), elements = new Map();
  const get = key => {
    if (!elements.has(key)) elements.set(key, { value: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {} }, addEventListener() {}, click() {} });
    return elements.get(key);
  };
  const backupContext = vm.createContext({ localStorage: backupStorage,
    window: { initialTasks: [], DailyJournal: { persist: () => true, restored() {}, entries: () => Core.entries(backupStorage) } },
    DailyCore: Core, document: { querySelector: get, querySelectorAll: () => [], createElement: () => ({ click() {} }) },
    Date, console, Blob, URL, setTimeout() {}, clearTimeout() {}, confirm: () => true,
    FileReader: class { readAsText(file) { this.result = file; this.onload(); } }
  });
  vm.runInContext('const DailyJournal = window.DailyJournal;', backupContext);
  vm.runInContext(inline, backupContext);
  Core.put(backupStorage, '2026-10-26', '保留当前总结');
  const task = { id: 'test', title: '计划', q: 1, started: '2026-10-26T09:00:00Z', done: null };
  const importText = data => { backupContext.backupText = JSON.stringify(data); vm.runInContext('importBackup(backupText)', backupContext); };
  importText({ version: 2, tasks: [task], dailySummaries: [{ date: '2026-10-26', text: '冲突内容' }, { date: '2026-10-25', text: '导入的往日总结' }] });
  assert.equal(JSON.parse(backupStorage.getItem('quadrantTasks'))[0].id, 'test');
  assert.equal(Core.entries(backupStorage).find(e => e.date === '2026-10-26').text, '保留当前总结');
  assert.equal(Core.entries(backupStorage).length, 2);
  importText([]); // Legacy task-only backups must leave journals intact.
  assert.equal(Core.entries(backupStorage).length, 2);
  importText({ tasks: [task], dailySummaries: [{ date: 'wrong', text: '错误数据' }] });
  assert.equal(backupStorage.getItem('quadrantTasks'), '[]');
  assert.equal(Core.entries(backupStorage).length, 2);
  // A task completed just after midnight belongs to the local month, not its UTC month.
  backupContext.checkTasks = [
    { id: 'late', title: '<script>计划</script>', q: 0, started: '2026-10-30T12:00:00Z', done: '2026-10-31T16:15:00Z' },
    { id: 'early', title: '十月计划', q: 1, started: '2026-10-30T12:00:00Z', done: '2026-10-31T15:00:00Z' }
  ];
  vm.runInContext("tasks=checkTasks;save();qs('#year').value='2026';qs('#month').value='11';qs('#period').value='month';renderSummary()", backupContext);
  assert.match(get('#summaryTitle').textContent, /共完成 1 项/);
  assert.ok(get('#summaryBody').innerHTML.includes('&lt;script&gt;计划&lt;/script&gt;'));
  assert.ok(!get('#summaryBody').innerHTML.includes('十月计划'));
  assert.ok(get('#summaryBody').innerHTML.includes('data-delete="late"'));
  assert.equal(vm.runInContext("csvCell('=1+1')", backupContext), '"\'=1+1"');
  vm.runInContext("removeTask('late')", backupContext);
  assert.equal(JSON.parse(backupStorage.getItem('quadrantTasks')).length, 1);
  assert.match(get('#summaryTitle').textContent, /共完成 0 项/);
  const beforeFailure = backupStorage.getItem('quadrantTasks');
  backupStorage.fail = true;
  vm.runInContext("tasks=[];save()", backupContext);
  assert.equal(vm.runInContext('tasks.length', backupContext), 1);
  assert.equal(backupStorage.getItem('quadrantTasks'), beforeFailure);
  assert.match(get('#toast').textContent, /保存失败/);
  backupStorage.fail = false;
  assert.ok(!fs.readFileSync(path.join(__dirname, '../web/daily.js'), 'utf8').includes('downloadDailyHtml'));
  console.log('PASS: autosave, midnight automatic file update, same-file archive, date deduplication, saving feedback, denied permission, cancellation and failure recovery');
  console.log('PASS: existing tasks preserved, v2/legacy backups, import conflict handling, local-month summary, deletion after filters, escaped content, CSV formula protection and storage rollback');
})().catch(error => { console.error(error); process.exitCode = 1; });
