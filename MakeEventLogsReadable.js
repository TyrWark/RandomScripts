// ==UserScript==
// @name         Prettify Event Log
// @namespace    ty.wark.lightspeed
// @version      1.1
// @description  Makes event logs not terrible to read
// @match        https://*.merchantos.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BTN_ID = 'ls-pretty-json-btn';

  function onEventLogPage() {
    const q = new URLSearchParams(location.search);
    return q.get('name') === 'transaction.views.transaction' && q.get('tab') === 'event_log';
  }

  const decoder = document.createElement('textarea');
  function decodeEntities(s) {
    decoder.innerHTML = s;
    return decoder.value;
  }

  function prettifyPre(pre) {
    let changed = false;
    pre.childNodes.forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const m = node.nodeValue.match(/^(\s*values\s*\[)([\s\S]*)\](\s*)$/);
      if (!m) return;

      const jsonText = decodeEntities(m[2]).trim(); // &quot; -> "
      try {
        const obj = JSON.parse(jsonText);
        node.nodeValue = 'values [\n' + JSON.stringify(obj, null, 2) + '\n]';
        changed = true;
      } catch (e) {
        /* not valid JSON -> leave untouched */
      }
    });
    return changed;
  }

  function runPrettify() {
    // 1. Force every detail cell open
    document.querySelectorAll('[id$="_form_vars_long"]').forEach((el) => (el.style.display = ''));
    // 2. Strip the toggles
    document.querySelectorAll('[id$="_form_vars_short"]').forEach((el) => (el.style.display = 'none'));
    document.querySelectorAll('[id$="_form_vars_long"] > a').forEach((a) => (a.style.display = 'none'));


    let count = 0;
    document.querySelectorAll('[id*="_form_vars_long"] pre').forEach((pre) => {
      if (prettifyPre(pre)) count++;
    });
    return count;
  }

  function injectButton() {
    if (document.getElementById(BTN_ID)) return;
    const table =
      document.querySelector('#admin_listings_events_view table') ||
      document.querySelector('#tab_event_log > div > table') ||
      document.querySelector('#tab_event_log table');
    if (!table) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Expand + Prettify "values" JSON';
    btn.style.cssText =
      'margin:8px 0;padding:6px 12px;font:inherit;cursor:pointer;' +
      'background:#0a7cff;color:#fff;border:none;border-radius:4px;';
    btn.addEventListener('click', () => {
      const n = runPrettify();
      btn.textContent = `Prettified ${n} row(s) \u2713`;
      setTimeout(() => (btn.textContent = 'Expand + Prettify "values" JSON'), 2500);
    });

    table.parentNode.insertBefore(btn, table);
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      if (onEventLogPage()) injectButton();
    }, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  if (onEventLogPage()) injectButton();
})();
