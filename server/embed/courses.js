/*!
 * Hazdemy course list for websites.
 *
 *   <div data-atlas-courses data-key="atlas_pk_..." data-theme="hazdemy"></div>
 *   <script src="https://YOUR-ATLAS-ADDRESS/embed/courses.js" async></script>
 *
 * Options (data-* attributes on the div):
 *   key        website key from ATLAS → Website API (required)
 *   theme      hazdemy | navy | plain              accent   any CSS colour, overrides the theme colour
 *   mode       light | dark                        limit    courses per page (default 9)
 *   vendor, platform, product, level              show only these courses
 *   client     only the custom versions made for this client, e.g. Acme Corp
 *   custom     1 → only custom (client) versions · 0 → only standard courses
 *   sort       name | rating | popular | newest | shortest | price | upcoming
 *   time-zone  default zone for class times, e.g. Asia/Kolkata (default: the visitor's own)
 *   toolbar    off  → hide search, filters and sort
 *   enquiry    off  → hide the "Ask about this course" form
 *   enroll-url link for an Enroll button, e.g. https://www.hazdemy.com/enroll?course={code}  ({code} {id} {name})
 *   heading    a title shown above the list
 * Pages that add the div later can call window.AtlasCourses.mount(div).
 * The div fires an "atlas:enquiry" event (detail: { course }) after someone sends the form.
 */
(function () {
  'use strict';
  var script = document.currentScript || [].slice.call(document.scripts).filter(function (s) { return /\/embed\/courses\.js/.test(s.src); })[0];
  var BASE = script ? new URL(script.src, location.href).origin : '';
  var THEMES = {
    hazdemy: { acc: '#8E1B1E', deep: '#4E0405', gold: '#E9A23B' },
    navy: { acc: '#1B3A8C', deep: '#14214D', gold: '#E9A23B' },
    plain: { acc: '#334155', deep: '#0F172A', gold: '#F59E0B' }
  };
  var SORTS = [['name', 'Name A–Z'], ['rating', 'Highest rated'], ['popular', 'Most popular'], ['newest', 'Newest'], ['shortest', 'Shortest first'], ['price', 'Price: low to high'], ['upcoming', 'Starting soonest']];

  var CSS = [
    ':host{all:initial;display:block;font-family:inherit;color:var(--ink);line-height:1.5;--r:14px}',
    '*,*::before,*::after{box-sizing:border-box}',
    '.wrap{font-family:inherit;font-size:15px}',
    'h2.title{font-size:26px;margin:0 0 16px;color:var(--ink);font-weight:700;letter-spacing:-.01em}',
    '.bar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}',
    '.bar input,.bar select{font:inherit;font-size:14px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-height:42px}',
    '.bar input{flex:1 1 240px;min-width:0}',
    '.bar select{flex:0 1 180px;min-width:0;cursor:pointer}',
    '.bar :focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--acc);outline-offset:2px}',
    '.count{font-size:13px;color:var(--muted);margin:-6px 0 14px}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:18px}',
    '.card{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;transition:box-shadow .2s,transform .2s}',
    '.card:hover{box-shadow:0 12px 28px rgba(15,23,42,.10);transform:translateY(-2px)}',
    '.band{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 16px;background:var(--deep);color:#fff;font-size:12px}',
    '.band .code{font-weight:700;letter-spacing:.04em}',
    '.chip{display:inline-block;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.14);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%}',
    '.body{display:flex;flex-direction:column;gap:10px;padding:16px;flex:1}',
    '.card h3{font-size:16.5px;line-height:1.35;margin:0;color:var(--ink);font-weight:650}',
    '.sum{font-size:13.5px;color:var(--muted);margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.meta{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:0;padding:0}',
    '.meta li{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--soft);color:var(--ink2)}',
    '.foot{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:4px;font-size:13.5px}',
    '.stars{color:var(--gold);letter-spacing:1px}.rate{color:var(--muted)}',
    '.price{font-weight:700;color:var(--ink)}',
    '.btn{font:inherit;font-size:14px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 16px;border-radius:10px;border:1px solid var(--acc);background:var(--acc);color:#fff;cursor:pointer;text-decoration:none;min-height:42px}',
    '.btn:hover{filter:brightness(1.08)}',
    '.btn.ghost{background:transparent;color:var(--acc)}',
    '.btn:disabled{opacity:.6;cursor:default}',
    '.more{display:flex;justify-content:center;margin-top:22px}',
    '.state{padding:36px 16px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:var(--r);background:var(--surface)}',
    '.state.err{color:#B42318;border-color:#F3B4AE;background:#FEF3F2}',
    '.skel{height:250px;border-radius:var(--r);background:linear-gradient(90deg,var(--soft),var(--line),var(--soft));background-size:200% 100%;animation:sh 1.2s infinite}',
    '@keyframes sh{to{background-position:-200% 0}}',
    '.ov{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;z-index:2147483000;overflow:auto}',
    '.dlg{position:relative;width:100%;max-width:760px;background:var(--surface);color:var(--ink);border-radius:18px;box-shadow:0 30px 70px rgba(0,0,0,.3);overflow:hidden}',
    '.dhead{background:var(--deep);color:#fff;padding:22px 56px 20px 24px}',
    '.dhead .code{font-size:12.5px;font-weight:700;letter-spacing:.05em;color:var(--gold)}',
    '.dhead h2{font-size:22px;line-height:1.3;margin:4px 0 10px;color:#fff}',
    '.dhead .meta li{background:rgba(255,255,255,.14);color:#fff}',
    '.x{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.15);color:#fff;font-size:20px;line-height:1;cursor:pointer}',
    '.dbody{padding:20px 24px 26px;display:flex;flex-direction:column;gap:18px}',
    '.acts{display:flex;flex-wrap:wrap;gap:10px}',
    '.sec h4{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--acc);margin:0 0 6px}',
    '.rich{font-size:14.5px;color:var(--ink2)}.rich p{margin:0 0 8px}.rich ul,.rich ol{margin:0 0 8px;padding-left:20px}.rich li{margin:2px 0}',
    '.out{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden}',
    '.cust{display:inline-block;align-self:flex-start;margin:0;font-size:11.5px;font-weight:700;color:var(--acc);background:var(--soft);border-radius:999px;padding:3px 9px}',
    '.next{margin:0;font-size:13px;color:var(--ink2);padding:7px 10px;border-radius:8px;background:var(--soft)}',
    '.next span{color:var(--acc);font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em}.next b{color:var(--ink)}',
    '.sh{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}.sh h4{margin:0}',
    '.tz{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}',
    '.tz select{font:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 8px;max-width:240px}',
    '.bts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}',
    '.bts li{padding:12px 14px;border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;gap:3px}',
    '.bts .bd{font-size:14px;color:var(--ink)}.bts .tm{font-size:16px;font-weight:650;color:var(--acc);font-variant-numeric:tabular-nums}',
    '.bts .m,.bd .m{font-size:12.5px;color:var(--muted)}.bts .st{color:#B42318;font-weight:600}',
    '.out li{display:flex;justify-content:space-between;gap:12px;padding:9px 14px;font-size:14px;border-top:1px solid var(--line)}',
    '.out li:first-child{border-top:0}.out li.day{background:var(--soft);font-weight:650;font-size:13px}',
    '.out .m{color:var(--muted);white-space:nowrap}',
    '.ppl{display:flex;flex-wrap:wrap;gap:10px}',
    '.ppl>span{display:flex;align-items:center;gap:8px;font-size:14px;line-height:1.3}',
    '.av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--acc);color:#fff;font-size:12.5px;font-weight:700;font-style:normal;flex:none}',
    '.ppl small{display:block;color:var(--muted);font-size:12px}',
    'form.enq{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:18px;border-radius:14px;background:var(--soft)}',
    'form.enq h4,form.enq .full{grid-column:1/-1}',
    'form.enq h4{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--acc);margin:0}',
    'form.enq label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--ink2)}',
    'form.enq input,form.enq textarea{font:inherit;font-size:14px;font-weight:400;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:9px 11px}',
    'form.enq textarea{min-height:84px;resize:vertical}',
    'form.enq .e{color:#B42318;font-size:12px;font-weight:500}',
    'form.enq p.e{margin:0;font-size:13px}form.enq p.e:empty{display:none}',
    'form.enq .trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}',
    '.ok{padding:16px;border-radius:12px;background:#ECFDF3;color:#067647;font-weight:600}',
    '@media (max-width:560px){form.enq{grid-template-columns:1fr}.dhead h2{font-size:19px}.bar select{flex:1 1 45%}}',
    '@media (prefers-reduced-motion:reduce){.card,.skel{transition:none;animation:none}}'
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function stars(r) { var n = Math.round(r); return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  function initials(n) { return String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function money(v, cur) { try { return v.toLocaleString(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }); } catch (e) { return (cur || '') + ' ' + v; } }
  function length(c) { return c.durationDays ? c.durationDays + (c.durationDays === 1 ? ' day' : ' days') : c.hours ? c.hours + ' hrs' : ''; }
  // a client's own version of a course: "Custom for Acme Corp"
  function custom(c) { return c.customFor ? '<p class="cust" title="' + esc(c.baseCourse ? 'Custom version of ' + c.baseCourse.name : 'Custom version') + '">Custom for ' + esc(c.customFor) + '</p>' : ''; }
  function chips(c) { return [c.level, length(c), c.delivery].filter(Boolean).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); }

  /* ---------- batch times in the visitor's (or a chosen) time zone ---------- */
  var ZONES = [['Asia/Kolkata', 'India'], ['America/New_York', 'US Eastern'], ['America/Chicago', 'US Central'], ['America/Denver', 'US Mountain'], ['America/Los_Angeles', 'US Pacific'],
    ['America/Toronto', 'Canada Eastern'], ['Europe/London', 'UK'], ['Europe/Berlin', 'Central Europe'], ['Africa/Johannesburg', 'South Africa'], ['Asia/Dubai', 'UAE'],
    ['Asia/Riyadh', 'Saudi Arabia'], ['Asia/Singapore', 'Singapore'], ['Asia/Tokyo', 'Japan'], ['Australia/Sydney', 'Australia Eastern'], ['UTC', 'UTC']];
  var FIXED = { 'Asia/Kolkata': 'IST', 'Asia/Dubai': 'GST', 'Asia/Riyadh': 'AST', 'Asia/Singapore': 'SGT', 'Asia/Tokyo': 'JST', 'Africa/Johannesburg': 'SAST', UTC: 'UTC' };
  // browsers report some zones under old names (Chrome says "Asia/Calcutta"); use the name the batches use
  var ALIASES = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv' };
  function canon(tz) { try { return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone; } catch (e) { return tz; } }
  function localZone() {
    var tz = 'UTC';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { /* very old browser */ }
    if (ALIASES[tz]) return ALIASES[tz];
    var c = canon(tz);
    for (var i = 0; i < ZONES.length; i++) if (canon(ZONES[i][0]) === c) return ZONES[i][0];
    return tz;
  }
  function zoneLabel(tz) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i][0] === tz) return ZONES[i][1]; return tz.split('/').pop().replace(/_/g, ' '); }
  function abbr(tz, ms) {
    if (FIXED[tz]) return FIXED[tz];
    var part = function (loc, style) { try { var p = new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: style }).formatToParts(new Date(ms)).filter(function (x) { return x.type === 'timeZoneName'; })[0]; return p ? p.value : ''; } catch (e) { return ''; } };
    var locs = ['en-US', 'en-GB', 'en-AU', 'en-IN'];
    for (var i = 0; i < locs.length; i++) { var n = part(locs[i], 'short'); if (n && !/^(GMT|UTC)[+\-−]/.test(n)) return n; }
    return part('en-US', 'shortOffset') || tz;
  }
  function timeIn(iso, tz) { return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); }
  function dayIn(iso, tz) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
  function shortDate(s, year) { return new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: year ? 'numeric' : undefined }); }
  function dates(b) { return b.startDate === b.endDate ? shortDate(b.startDate, true) : shortDate(b.startDate) + ' – ' + shortDate(b.endDate, true); }
  /** "11:30 PM – 7:30 AM EST (day before)": the first class of a batch seen from `tz`. */
  function slot(b, tz) {
    var d = dayIn(b.startUtc, tz);
    return timeIn(b.startUtc, tz) + ' – ' + timeIn(b.endUtc, tz) + ' ' + abbr(tz, Date.parse(b.startUtc)) + (d < b.startDate ? ' (day before)' : d > b.startDate ? ' (next day)' : '');
  }

  function mount(el) {
    if (!el || el.__atlas) return;
    el.__atlas = true;
    var o = el.dataset, key = o.key || '';
    var th = THEMES[o.theme === 'nfolks' ? 'navy' : o.theme] || THEMES.hazdemy /* "nfolks": the navy theme's old name */, dark = o.mode === 'dark', acc = o.accent || th.acc;
    var root = el.attachShadow ? el.attachShadow({ mode: 'open' }) : el;
    var vars = ':host{--acc:' + acc + ';--deep:' + (o.accent ? acc : th.deep) + ';--gold:' + th.gold + ';' + (dark
      ? '--ink:#F1F5F9;--ink2:#CBD5E1;--muted:#94A3B8;--surface:#111827;--soft:#1F2937;--line:#334155}'
      : '--ink:#0F172A;--ink2:#334155;--muted:#64748B;--surface:#FFFFFF;--soft:#F4F5F7;--line:#E2E8F0}');
    var state = { q: '', platform: o.platform || '', level: o.level || '', sort: o.sort || 'name', items: [], total: 0, offset: 0 };
    var limit = Math.min(100, Math.max(1, parseInt(o.limit, 10) || 9));
    var showBar = o.toolbar !== 'off', showEnquiry = o.enquiry !== 'off';
    var zone = o.timeZone || localZone(); // data-time-zone sets a default, e.g. Asia/Kolkata for an India-only site
    root.innerHTML = '<style>' + vars + CSS + '</style><div class="wrap">' + (o.heading ? '<h2 class="title">' + esc(o.heading) + '</h2>' : '') +
      (showBar ? '<div class="bar" role="search"><input type="search" aria-label="Search courses" placeholder="Search courses, products or codes…"><select data-f="platform" aria-label="Platform"><option value="">All platforms</option></select><select data-f="level" aria-label="Level"><option value="">All levels</option></select><select data-f="sort" aria-label="Sort by">' +
        SORTS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === state.sort ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div>' : '') +
      '<p class="count" aria-live="polite"></p><div class="grid"></div><div class="more"></div></div>';
    var $ = function (s) { return root.querySelector(s); };
    var grid = $('.grid'), more = $('.more'), count = $('.count');

    function api(path, params, init) {
      var u = new URL(BASE + '/api/v1' + path);
      u.searchParams.set('key', key);
      Object.keys(params || {}).forEach(function (k) { if (params[k] !== '' && params[k] != null) u.searchParams.set(k, params[k]); });
      return fetch(u.toString(), init).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'The course list couldn’t load.'); e.fields = j.fields; throw e; } return j; });
      });
    }
    function fail(e) { grid.innerHTML = ''; more.innerHTML = ''; count.textContent = ''; grid.innerHTML = '<div class="state err" style="grid-column:1/-1" role="alert">' + esc(e.message || e) + '</div>'; }
    if (!key) return fail('Add your website key: data-key="atlas_pk_…"');
    if (!BASE) return fail('Load courses.js from your Hazdemy address.');

    function card(c) {
      return '<article class="card"><div class="band"><span class="code">' + esc(c.code) + '</span>' + (c.platform ? '<span class="chip">' + esc(c.platform) + '</span>' : '') + '</div>' +
        '<div class="body"><h3>' + esc(c.name) + '</h3>' + custom(c) + (c.summary ? '<p class="sum">' + esc(c.summary) + '</p>' : '') + '<ul class="meta">' + chips(c) + '</ul>' +
        (c.nextBatch ? '<p class="next"><span>Next batch</span> <b>' + esc(shortDate(c.nextBatch.startDate)) + '</b> · ' + esc(slot(c.nextBatch, zone)) + '</p>' : '') +
        '<div class="foot"><span>' + (c.rating ? '<span class="stars" aria-hidden="true">' + stars(c.rating) + '</span> <span class="rate">' + c.rating.toFixed(1) + ' (' + c.ratings + ')</span>' : '') + '</span>' +
        (c.price ? '<span class="price">' + esc(money(c.price, c.currency)) + '</span>' : '') + '</div>' +
        '<button class="btn" type="button" data-open="' + esc(c.id) + '" aria-label="View details of ' + esc(c.name) + '">View details</button></div></article>';
    }
    function load(append) {
      if (!append) { state.offset = 0; grid.innerHTML = Array(Math.min(limit, 6) + 1).join('<div class="skel"></div>'); more.innerHTML = ''; }
      var p = { q: state.q, platform: state.platform, level: state.level, sort: state.sort, vendor: o.vendor, product: o.product, client: o.client, custom: o.custom, limit: limit, offset: state.offset };
      return api('/courses', p).then(function (r) {
        state.items = append ? state.items.concat(r.items) : r.items; state.total = r.total;
        state.offset = state.items.length;
        count.textContent = r.total ? r.total + (r.total === 1 ? ' course' : ' courses') : '';
        grid.innerHTML = state.items.length ? state.items.map(card).join('') : '<div class="state" style="grid-column:1/-1">No courses match. Try other words or clear the filters.</div>';
        more.innerHTML = state.items.length < r.total ? '<button class="btn ghost" type="button" data-more>Show more courses</button>' : '';
      }, fail);
    }
    if (showBar) {
      api('/filters', { vendor: o.vendor }).then(function (f) {
        var fill = function (sel, list, cur) { sel.insertAdjacentHTML('beforeend', list.map(function (x) { return '<option value="' + esc(x.value) + '"' + (x.value.toLowerCase() === String(cur).toLowerCase() ? ' selected' : '') + '>' + esc(x.value) + ' (' + x.count + ')</option>'; }).join('')); };
        if (o.platform || f.platforms.length < 2) $('[data-f=platform]').style.display = 'none'; else fill($('[data-f=platform]'), f.platforms, state.platform);
        if (o.level || f.levels.length < 2) $('[data-f=level]').style.display = 'none'; else fill($('[data-f=level]'), f.levels, state.level);
      }, function () {});
      var t;
      var box = $('.bar input');
      box.addEventListener('input', function () { var v = box.value.trim(); clearTimeout(t); t = setTimeout(function () { if (v !== state.q) { state.q = v; load(); } }, 300); });
      root.querySelectorAll('.bar select').forEach(function (s) { s.addEventListener('change', function () { state[s.dataset.f] = s.value; load(); }); });
    }

    /* ---------- details window ---------- */
    var opener = null;
    function close() { var ov = $('.ov'); if (ov) ov.remove(); document.removeEventListener('keydown', onKey, true); if (opener) opener.focus(); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { // keep focus inside the window
        var f = [].slice.call($('.dlg').querySelectorAll('button,a[href],input,textarea,select')).filter(function (x) { return x.offsetParent !== null; });
        var active = root.activeElement || document.activeElement;
        if (e.shiftKey && active === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && active === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    function outline(list) {
      if (!list.length) return '';
      var day = null, rows = '';
      list.forEach(function (l) {
        if (l.day && l.day !== day) { day = l.day; rows += '<li class="day">' + esc(/^\d+$/.test(day) ? 'Day ' + day : day) + '</li>'; }
        rows += '<li><span>' + esc(l.title) + '</span>' + (l.minutes ? '<span class="m">' + (l.minutes >= 60 ? Math.round(l.minutes / 6) / 10 + ' h' : l.minutes + ' min') + '</span>' : '') + '</li>';
      });
      return '<div class="sec"><h4>Course outline</h4><ul class="out">' + rows + '</ul></div>';
    }
    function zoneOptions() {
      var list = ZONES.map(function (z) { return z[0]; });
      if (list.indexOf(zone) < 0) list.unshift(zone);
      var mine = localZone();
      if (list.indexOf(mine) < 0) list.unshift(mine);
      return list.map(function (z) { return '<option value="' + esc(z) + '"' + (z === zone ? ' selected' : '') + '>' + esc(zoneLabel(z)) + ' (' + esc(abbr(z, Date.now())) + ')' + (z === mine ? ' – your time' : '') + '</option>'; }).join('');
    }
    function batches(list) {
      return list.map(function (b) {
        var own = b.timeZone === zone;
        return '<li><div class="bd"><b>' + esc(dates(b)) + '</b>' + (b.days ? ' <span class="m">· ' + esc(b.days) + '</span>' : '') + '</div>' +
          '<div class="tm">' + esc(slot(b, zone)) + '</div>' +
          '<div class="m">' + (own ? '' : esc(b.times) + ' in ' + esc(zoneLabel(b.timeZone)) + ' · ') + esc(b.mode) + (b.location ? ' · ' + esc(b.location) : '') +
          (b.status && b.status !== 'Open' ? ' · <span class="st">' + esc(b.status) + '</span>' : '') + '</div></li>';
      }).join('');
    }
    function schedule(list) {
      if (!list || !list.length) return '';
      return '<div class="sec"><div class="sh"><h4>Upcoming batches</h4><label class="tz">Show times in <select data-tz>' + zoneOptions() + '</select></label></div><ul class="bts">' + batches(list) + '</ul></div>';
    }
    function sec(title, body, raw) { return body ? '<div class="sec"><h4>' + title + '</h4><div class="rich">' + (raw ? body : '<p>' + esc(body) + '</p>') + '</div></div>' : ''; }
    function enrollLink(c) { return o.enrollUrl ? o.enrollUrl.replace(/\{code\}/g, encodeURIComponent(c.code)).replace(/\{id\}/g, encodeURIComponent(c.id)).replace(/\{name\}/g, encodeURIComponent(c.name)) : ''; }
    function form(c) {
      return '<form class="enq" novalidate><h4>Ask about this course</h4>' +
        '<label>Name *<input name="name" autocomplete="name" required><span class="e" data-e="name"></span></label>' +
        '<label>Email *<input name="email" type="email" autocomplete="email" required><span class="e" data-e="email"></span></label>' +
        '<label>Phone<input name="phone" type="tel" autocomplete="tel"><span class="e" data-e="phone"></span></label>' +
        '<label>Company<input name="company" autocomplete="organization"></label>' +
        '<label class="full">Message<textarea name="message" placeholder="Dates, number of people, questions…"></textarea></label>' +
        '<label class="trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
        '<p class="e full" data-e="form" role="alert"></p><div class="full"><button class="btn" type="submit">Send request</button></div></form>';
    }
    function open(id, btn) {
      opener = btn;
      root.querySelector('.wrap').insertAdjacentHTML('beforeend', '<div class="ov"><div class="dlg" role="dialog" aria-modal="true" aria-label="Course details"><button class="x" type="button" aria-label="Close">×</button><div class="dhead"><h2>Loading…</h2></div></div></div>');
      var ov = $('.ov'), dlg = $('.dlg');
      ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('.x')) close(); });
      document.addEventListener('keydown', onKey, true);
      $('.x').focus();
      api('/courses/' + encodeURIComponent(id)).then(function (c) {
        var link = enrollLink(c);
        dlg.setAttribute('aria-label', c.name);
        dlg.innerHTML = '<button class="x" type="button" aria-label="Close">×</button><div class="dhead"><span class="code">' + esc(c.code) + (c.platform ? ' · ' + esc(c.platform) : '') + '</span><h2>' + esc(c.name) + '</h2>' + custom(c) + '<ul class="meta">' + chips(c) +
          (c.rating ? '<li>★ ' + c.rating.toFixed(1) + ' (' + c.ratings + ')</li>' : '') + (c.price ? '<li>' + esc(money(c.price, c.currency)) + '</li>' : '') + '</ul></div>' +
          '<div class="dbody"><div class="acts">' + (link ? '<a class="btn" href="' + esc(link) + '">Enroll now</a>' : '') +
          (showEnquiry ? '<button class="btn' + (link ? ' ghost' : '') + '" type="button" data-ask>Ask about this course</button>' : '') +
          '<a class="btn ghost" href="' + esc(c.links.outlinePdf + '?key=' + encodeURIComponent(key)) + '" target="_blank" rel="noopener">Download outline (PDF)</a></div>' +
          schedule(c.schedule) + sec('About this course', c.description, true) + sec('What you’ll learn', c.objectives, true) + sec('Topics', c.topics, true) + outline(c.outline) +
          sec('Who it’s for', c.audience, true) + sec('Prerequisites', c.prerequisites, true) + sec('Certification', c.certification) +
          (c.instructors.length ? '<div class="sec"><h4>Instructors</h4><div class="ppl">' + c.instructors.map(function (p) { return '<span><i class="av" aria-hidden="true">' + esc(initials(p.name)) + '</i><span>' + esc(p.name) + '<small>' + esc(p.title) + '</small></span></span>'; }).join('') + '</div></div>' : '') +
          (showEnquiry ? form(c) : '') + '</div>';
        $('.x').focus();
        var tz = dlg.querySelector('[data-tz]');
        if (tz) tz.addEventListener('change', function () {
          zone = tz.value; // the course cards follow the chosen zone too
          dlg.querySelector('.bts').innerHTML = batches(c.schedule);
          if (state.items.length) grid.innerHTML = state.items.map(card).join('');
        });
        var ask = dlg.querySelector('[data-ask]');
        if (ask) ask.addEventListener('click', function () { var f = dlg.querySelector('form.enq'); f.scrollIntoView({ behavior: 'smooth', block: 'start' }); f.querySelector('input').focus({ preventScroll: true }); });
        var f = dlg.querySelector('form.enq');
        if (f) f.addEventListener('submit', function (e) {
          e.preventDefault();
          var b = f.querySelector('button[type=submit]'), data = { course: c.id };
          [].forEach.call(f.elements, function (x) { if (x.name) data[x.name] = x.value; });
          f.querySelectorAll('[data-e]').forEach(function (x) { x.textContent = ''; });
          b.disabled = true; b.textContent = 'Sending…';
          api('/enquiries', {}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(function () {
            f.outerHTML = '<div class="ok" role="status">Thank you! We’ve received your request about ' + esc(c.code) + ' and will get back to you soon.</div>';
            el.dispatchEvent(new CustomEvent('atlas:enquiry', { bubbles: true, detail: { course: { id: c.id, code: c.code, name: c.name } } }));
          }, function (err) {
            b.disabled = false; b.textContent = 'Send request';
            var fields = err.fields || {};
            Object.keys(fields).forEach(function (k) { var s = f.querySelector('[data-e="' + k + '"]'); if (s) s.textContent = fields[k]; });
            if (!Object.keys(fields).length) f.querySelector('[data-e="form"]').textContent = err.message;
            var first = f.querySelector('[name="' + Object.keys(fields)[0] + '"]'); if (first) first.focus();
          });
        });
      }, function (e) { dlg.querySelector('.dhead').innerHTML = '<h2>' + esc(e.message) + '</h2>'; });
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b) return;
      if (b.dataset.open) open(b.dataset.open, b);
      else if (b.hasAttribute('data-more')) { b.disabled = true; b.textContent = 'Loading…'; load(true); }
    });
    load();
  }

  function scan() { [].forEach.call(document.querySelectorAll('[data-atlas-courses]'), mount); }
  window.AtlasCourses = { mount: mount, scan: scan };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
