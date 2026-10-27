// Re-Union X portal: tabs, status list (status.json), gallery (gallery.json) with a lightbox.
(function () {
  'use strict';
  var doc = document;
  doc.documentElement.className += ' js';
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  // ---- tabs: one section visible, chosen by the address hash (#status, #help...);
  // the sections have ids «sec-...» so the browser does not jump down to them ----
  var sections = [].slice.call(doc.querySelectorAll('[data-section]'));
  var tabs = [].slice.call(doc.querySelectorAll('[data-tab]'));
  function show(id, scroll) {
    var key = function (s) { return s.getAttribute('data-section'); };
    if (!sections.some(function (s) { return key(s) === id; })) id = 'home';
    sections.forEach(function (s) { s.classList.toggle('on', key(s) === id); });
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-tab') === id;
      t.classList.toggle('on', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (id === 'notices') {
      var f = doc.getElementById('notices-frame');
      if (f && !f.getAttribute('src')) f.setAttribute('src', f.getAttribute('data-src'));
    }
    if (scroll) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function () { show(location.hash.slice(1), true); });
  show(location.hash.slice(1), false);

  // ---- status (site/status.json) ----
  var GROUPS = [
    { state: 'done', title: 'Works today', tag: 't-update', label: 'WORKS' },
    { state: 'progress', title: 'In progress', tag: 't-event', label: 'IN PROGRESS' },
    { state: 'missing', title: 'Not there yet', tag: 't-important', label: 'MISSING' }
  ];
  // optional «breakdown» of an area: {title, parts: [{tag, kind, count, label, detail, names?}], note?}
  function breakdown(b) {
    if (!b || !b.parts) return '';
    return '<details class="more"><summary>' + esc(b.title || 'Details') + '</summary><ul class="parts">' + b.parts.map(function (p) {
      var names = p.names && p.names.length ? '<span class="names">' + p.names.map(function (n) { return '<i>' + esc(n) + '</i>'; }).join('') + '</span>' : '';
      return '<li><span class="tag ' + esc(p.kind || 't-info') + '">' + esc(p.tag) + '</span><span class="pn">' + esc(p.count) + '</span>'
        + '<span class="pl"><b>' + esc(p.label) + '</b> ' + esc(p.detail) + names + '</span></li>';
    }).join('') + '</ul>' + (b.note ? '<p class="pnote">' + esc(b.note) + '</p>' : '') + '</details>';
  }
  function renderStatus(data) {
    var areas = data.areas || [];
    var done = areas.filter(function (a) { return a.state === 'done'; }).length;
    doc.getElementById('meter-val').textContent = done + '/' + areas.length;
    doc.getElementById('meter-fill').style.width = Math.round(100 * done / Math.max(1, areas.length)) + '%';
    doc.getElementById('status-summary').innerHTML = esc(data.summary) + ' <span class="small">Updated ' + esc(data.updated) + '.</span>';
    doc.getElementById('status-list').innerHTML = GROUPS.map(function (g) {
      var rows = areas.filter(function (a) { return a.state === g.state; });
      if (!rows.length) return '';
      return '<div class="group"><h3 class="sq">' + g.title + '</h3><ul class="rows status">' + rows.map(function (a) {
        var total = a.total || 1, n = Math.min(a.done || 0, total), pct = Math.round(100 * n / total);
        var count = a.unit ? n + '/' + total + ' ' + esc(a.unit) : (g.state === 'done' ? '' : pct + '%');
        return '<li class="s-' + g.state + '"><div class="st' + (g.state === 'done' && !a.unit ? ' nobar' : '') + '"><span class="tag ' + g.tag + '">' + g.label + '</span>'
          + '<span class="n">' + esc(a.name) + '</span><span class="c">' + count + '</span>'
          + '<span class="d">' + esc(a.detail) + '</span>'
          + '<span class="bar"><i style="width:' + pct + '%"></i></span></div>' + breakdown(a.breakdown) + '</li>';
      }).join('') + '</ul></div>';
    }).join('');
  }
  fetch('site/status.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(renderStatus).catch(function () {
    doc.getElementById('status-summary').innerHTML = 'The status list could not be loaded. See the <a href="https://github.com/Kxos/Re-Union-X#status">README</a>.';
  });

  // ---- gallery (site/gallery.json: [{"file": "x.png", "caption": "..."}], images in site/gallery/) ----
  var items = [], cur = 0;
  var lb = doc.getElementById('lightbox'), lbImg = doc.createElement('img'), lbCap = doc.getElementById('lb-cap');
  function open(i) {
    cur = (i + items.length) % items.length;
    lbImg.src = 'site/gallery/' + encodeURIComponent(items[cur].file);
    lbImg.alt = items[cur].caption || '';
    lbCap.textContent = items[cur].caption || '';
    lb.hidden = false;
  }
  doc.getElementById('lb-fig').insertBefore(lbImg, lbCap);
  function close() { lb.hidden = true; lbImg.removeAttribute('src'); }
  lb.querySelector('.lb-close').onclick = close;
  lb.querySelector('.lb-prev').onclick = function () { open(cur - 1); };
  lb.querySelector('.lb-next').onclick = function () { open(cur + 1); };
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  doc.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') open(cur - 1);
    else if (e.key === 'ArrowRight') open(cur + 1);
  });
  fetch('site/gallery.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (list) {
    items = (list || []).filter(function (it) { return it && it.file; });
    if (!items.length) return;
    doc.getElementById('gallery-empty').hidden = true;
    var grid = doc.getElementById('gallery-grid');
    grid.innerHTML = items.map(function (it, i) {
      return '<button type="button" data-i="' + i + '"><img loading="lazy" src="site/gallery/' + esc(encodeURIComponent(it.file))
        + '" alt="' + esc(it.caption) + '"><span>' + esc(it.caption) + '</span></button>';
    }).join('');
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) open(+b.getAttribute('data-i'));
    });
  }).catch(function () { /* keep the «coming soon» panel */ });
})();
