(function(){
  const $ = (sel) => document.querySelector(sel);
  const MINIMUM_KEYS = ['deepTask1', 'deepTask2', 'smallTask1', 'smallTask2'];
  const DEEP_TYPES = new Set(['DEEP_50', 'POMO_25']);
  const INTERRUPT_KEYWORD = '被打斷';

  document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
      console.error('載入週回顧失敗', err);
      setText('status', '載入資料時發生錯誤，請稍後再試。');
    });
  });

  function isoDate(date){
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function buildDateRange(){
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end.getTime());
    start.setDate(start.getDate() - 6);
    const dates = [];
    for (let i = 0; i < 7; i += 1){
      const current = new Date(start.getTime());
      current.setDate(start.getDate() + i);
      dates.push(isoDate(current));
    }
    return { dates, startIso: dates[0], endIso: dates[dates.length - 1], start, end };
  }

  async function init(){
    if (!window.DB){
      setText('status', '找不到資料庫模組。');
      return;
    }
    await DB.ready;
    if (typeof DB.migrateFromLocalStorage === 'function'){
      await DB.migrateFromLocalStorage();
    }

    const range = buildDateRange();
    updateRangeLabel(range);

    const dayRecords = await Promise.all(range.dates.map(date => DB.getDay(date).catch(() => null)));
    const statsByDate = {};
    range.dates.forEach((date, idx) => {
      const day = dayRecords[idx];
      statsByDate[date] = {
        completedMinimum: isMinimumComplete(day) ? 1 : 0,
        deepBlocks: 0,
        interrupts: 0
      };
    });

    const sessions = await DB.getSessionsInRange(range.startIso, range.endIso).catch(() => []);
    sessions.forEach(session => {
      if (!session) return;
      const dateKey = normalizeSessionDate(session);
      if (!dateKey || !statsByDate[dateKey]) return;
      if (DEEP_TYPES.has(session.type)) {
        statsByDate[dateKey].deepBlocks += 1;
      }
      const notes = (typeof session.notes === 'string') ? session.notes : '';
      if ((session.type && session.type === 'INTERRUPT') || notes.includes(INTERRUPT_KEYWORD)) {
        statsByDate[dateKey].interrupts += 1;
      }
    });

    const completedDays = range.dates.reduce((sum, date) => sum + (statsByDate[date].completedMinimum ? 1 : 0), 0);
    const completionRate = Math.round((completedDays / range.dates.length) * 100);
    const deepBlocksTotal = await DB.countDeepBlocks(range.startIso, range.endIso);
    const interruptsTotal = range.dates.reduce((sum, date) => sum + statsByDate[date].interrupts, 0);

    setText('completionRate', `${completionRate}%`);
    setText('deepBlocksTotal', deepBlocksTotal);
    setText('interruptsTotal', interruptsTotal);
    updateTable(range.dates, statsByDate);
    setText('status', 'CSV 欄位：date, completed_minimum, deep_blocks, interrupts');

    const exportBtn = $('#exportWeeklyCsv');
    if (exportBtn){
      exportBtn.addEventListener('click', () => {
        const header = 'date,completed_minimum,deep_blocks,interrupts\n';
        const rows = range.dates.map(date => [
          date,
          statsByDate[date].completedMinimum,
          statsByDate[date].deepBlocks,
          statsByDate[date].interrupts
        ].join(','));
        download(header + rows.join('\n'), `mvd_weekly_${range.endIso}.csv`, 'text/csv');
      });
    }

    if ('serviceWorker' in navigator){
      navigator.serviceWorker.register('sw.js');
    }
  }

  function updateRangeLabel(range){
    const rangeEl = $('#dateRange');
    if (!rangeEl) return;
    const startLabel = formatDisplayDate(range.startIso);
    const endLabel = formatDisplayDate(range.endIso);
    rangeEl.textContent = `${startLabel} – ${endLabel}（共 7 天）`;
  }

  function updateTable(dates, stats){
    const tbody = document.querySelector('#weeklyTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    dates.forEach(date => {
      const row = document.createElement('tr');
      const stat = stats[date];
      row.innerHTML = `
        <td>${formatDisplayDate(date)}</td>
        <td>${stat.completedMinimum ? '✅ 是' : '— 否'}</td>
        <td>${stat.deepBlocks}</td>
        <td>${stat.interrupts}</td>
      `;
      tbody.appendChild(row);
    });
  }

  function isMinimumComplete(day){
    if (!day || !day.tasks) return false;
    return MINIMUM_KEYS.every(key => {
      const task = day.tasks[key];
      return task && !!task.done;
    });
  }

  function normalizeSessionDate(session){
    if (session.date) return session.date;
    if (session.start){
      try {
        return isoDate(new Date(session.start));
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  function formatDisplayDate(iso){
    if (!iso) return '--';
    const date = new Date(`${iso}T00:00:00`);
    return date.toLocaleDateString('zh-Hant', { month: 'numeric', day: 'numeric', weekday: 'short' });
  }

  function setText(id, value){
    const el = document.getElementById(id);
    if (el){
      el.textContent = value;
    }
  }

  function download(content, filename, mime){
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
})();
