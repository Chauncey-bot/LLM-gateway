// First-party extension for the stock subscription page. No upstream bundle edits.
(async function () {
  const response = await fetch('/quota-ui/policy');
  if (!response.ok) return;
  const {groups} = await response.json();
  const codes = groups.map(g=>g.code).sort((a,b)=>b.length-a.length);
  const redraw = () => {
    const rows = [...document.querySelectorAll('tr, .card.card-hover, .max-h-64 > .border-b, article')];
    const scope = 'tr, .card.card-hover, .max-h-64 > .border-b, article';
    for (const row of rows) {
      // Never climb into the grid: a sibling cumulative card must not change
      // a daily card's expiry note or reset button.
      const owned = selector => [...row.querySelectorAll(selector)].filter(el=>el.closest(scope)===row);
      const planCodes = owned('*').filter(el=>!el.children.length)
        .flatMap(el=>el.textContent.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g)||[]);
      // Direct text nodes are used by compact dashboard views.
      for (const node of row.childNodes) if (node.nodeType===3) planCodes.push(...(node.textContent.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g)||[]));
      if (!codes.some(code=>planCodes.includes(code))) {
        const staleNotes=owned('.quota-expiry-note');
        if (staleNotes.length) {
          staleNotes.forEach(note=>note.remove());
          for (const button of owned('button')) if (/重置[^\n]*额度|Reset[^\n]*Quota/i.test(button.textContent)) {
            button.hidden=false; button.style.removeProperty('display');
          }
        }
        continue;
      }
      // The stock page uses both span and div nodes depending on viewport.
      // Match leaf elements by text instead of relying on one tag/class.
      for (const label of owned('*')) {
        if (label.children.length) continue;
        const original = label.textContent.trim();
        if (/^(月|Month)\s+\$/.test(original)) {
          label.textContent = original.replace(/^(月|Month)/, original.startsWith('月') ? '累计' : 'Cumulative');
          continue;
        }
        if (!['每月','Monthly','累计','Cumulative'].includes(original)) continue;
        const text = /[\u4e00-\u9fff]/.test(label.textContent) ? '累计' : 'Cumulative';
        if (label.textContent !== text) label.textContent = text;
        label.title = '最近一次成功发放起统计，到期结束；不按月重置';
        const reset = label.closest('.usage-row')?.querySelector('.reset-info');
        if (reset) { reset.hidden = true; reset.style.display = 'none'; }
      }
      {
        for (const button of owned('button')) {
          if (!/重置[^\n]*额度|Reset[^\n]*Quota/i.test(button.textContent)) continue;
          // Keep the expiry explicit immediately above the action button.
          // The stock card renders this as plain text, so extract the displayed
          // timestamp and avoid inventing a date when it is unavailable.
          const match = row.textContent.match(/\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}/);
          if (match) {
            let note = button.previousElementSibling;
            if (!note || !note.matches('.quota-expiry-note')) {
              note = document.createElement('p');
              button.parentNode.insertBefore(note, button);
            }
            note.className = 'quota-expiry-note text-xs text-gray-500 dark:text-dark-400';
            const text = `订阅额度将在${match[0].replaceAll('-', '/')}过期`;
            if (note.textContent !== text) note.textContent = text;
          }
          // Cumulative plans have no daily reset operation.
          button.hidden = true;
          button.style.display = 'none';
        }
      }
    }
  };
  let queued = false;
  let stopped = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(()=>{queued=false;if(!stopped)redraw();});
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.addEventListener('pagehide',()=>{stopped=true;observer.disconnect();});
  window.addEventListener('pageshow',()=>{
    stopped=false;
    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
    redraw();
  });
  redraw();
})().catch(()=>{ /* Upstream rendering remains available if extension cannot load. */ });
