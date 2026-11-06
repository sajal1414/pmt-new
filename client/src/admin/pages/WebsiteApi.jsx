import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Confirm, DataTable, Dialog, EmptyState, Field, PageHead, sortRows, downloadText, toCSV } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useData, useToast } from '../../lib/store.jsx';
import { ago } from '../../lib/constants.js';
import { useAdminData, useTable, Loading, ErrorNote, Stats, Tag, SearchBox, num, fmtDay } from '../lib.jsx';

const THEMES = [{ value: 'hazdemy', label: 'Hazdemy (maroon & gold)' }, { value: 'navy', label: 'Navy & gold' }, { value: 'plain', label: 'Plain (slate)' }];
const lines = (s) => String(s || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const blank = { name: '', origins: '', vendors: '', platforms: '' };
const copy = (text, toast, what) => navigator.clipboard.writeText(text).then(() => toast(`${what} copied`), () => toast('Copy didn’t work. Select the text and copy it by hand.'));

/** The <div> + <script> a website pastes in, built from the chosen options. */
function snippet(origin, key, o) {
  const attrs = [['key', key.key], ['theme', o.theme], o.mode === 'dark' && ['mode', 'dark'], o.accent && ['accent', o.accent], o.heading && ['heading', o.heading], o.platform && ['platform', o.platform],
    o.limit && +o.limit !== 9 && ['limit', o.limit], o.enrollUrl && ['enroll-url', o.enrollUrl], !o.toolbar && ['toolbar', 'off'], !o.enquiry && ['enquiry', 'off']].filter(Boolean);
  const q = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<div data-atlas-courses\n${attrs.map(([k, v]) => `     data-${k}="${q(v)}"`).join('\n')}></div>\n<script src="${origin}/embed/courses.js" async></script>`;
}

/** Live preview: a fresh div each time the options change, filled in by the same courses.js the websites load. */
function Preview({ k, o }) {
  const box = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    const div = document.createElement('div');
    div.setAttribute('data-atlas-courses', '');
    const set = { key: k.key, theme: o.theme, mode: o.mode, accent: o.accent, heading: o.heading, platform: o.platform, limit: o.limit || '6', enrollUrl: o.enrollUrl, toolbar: o.toolbar ? '' : 'off', enquiry: o.enquiry ? '' : 'off' };
    Object.entries(set).forEach(([a, v]) => { if (v) div.dataset[a] = v; });
    host.replaceChildren(div);
    const run = () => window.AtlasCourses.mount(div);
    if (window.AtlasCourses) run();
    else {
      let s = document.querySelector('script[data-atlas-preview]');
      if (!s) { s = document.createElement('script'); s.src = '/embed/courses.js'; s.async = true; s.dataset.atlasPreview = ''; document.head.appendChild(s); }
      s.addEventListener('load', run, { once: true });
      s.addEventListener('error', () => setErr('The course list script didn’t load. Is the Hazdemy server running?'), { once: true });
    }
  }, [k.key, o.theme, o.mode, o.accent, o.heading, o.platform, o.limit, o.enrollUrl, o.toolbar, o.enquiry]);
  return <>{err && <p className="note" role="alert" style={{ color: 'var(--red-ink)' }}>{err}</p>}<div ref={box} className={`wa-preview${o.mode === 'dark' ? ' dark' : ''}`} /></>;
}

function EmbedDialog({ k, onClose }) {
  const toast = useToast();
  const { courses } = useData();
  const [o, setO] = useState({ theme: 'hazdemy', mode: 'light', accent: '', heading: 'Our courses', platform: '', limit: '9', enrollUrl: '', toolbar: true, enquiry: true });
  useEffect(() => { if (k) setO((s) => ({ ...s, theme: /hazdemy/i.test(k.name) ? 'hazdemy' : s.theme })); }, [k]);
  const set = (f) => (v) => setO((s) => ({ ...s, [f]: v }));
  const platforms = useMemo(() => [...new Set(courses.map((c) => (c.platform || '').trim()).filter(Boolean))].sort(), [courses]);
  if (!k) return null;
  const code = snippet(window.location.origin, k, o);
  return (
    <Dialog open wide title={`Add courses to ${k.name}`} subtitle="Paste this where the course list should appear: a WordPress “Custom HTML” block, a Wix/Webflow embed, or straight into the page’s HTML." onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => copy(code, toast, 'Embed code')}><Icon name="copy" small />Copy embed code</button></>}>
      <div className="form wa-opts">
        <Field id="em-theme" label="Look" type="select" hideEmpty options={THEMES} value={o.theme} onChange={set('theme')} />
        <Field id="em-mode" label="Background" type="select" hideEmpty options={[{ value: 'light', label: 'Light page' }, { value: 'dark', label: 'Dark page' }]} value={o.mode} onChange={set('mode')} />
        <Field id="em-acc" label="Brand colour (optional)" value={o.accent} onChange={set('accent')} placeholder="#8E1B1E" />
        <Field id="em-head" label="Heading" value={o.heading} onChange={set('heading')} placeholder="Leave empty for none" />
        <Field id="em-plat" label="Only this platform" type="select" hideEmpty options={[{ value: '', label: 'All platforms' }, ...platforms.map((p) => ({ value: p, label: p }))]} value={o.platform} onChange={set('platform')} />
        <Field id="em-limit" label="Courses per page" type="number" value={o.limit} onChange={set('limit')} />
        <Field id="em-enroll" className="full" label="Enroll button link (optional)" value={o.enrollUrl} onChange={set('enrollUrl')} placeholder="https://www.hazdemy.com/enroll?course={code}" />
        <label className="am-toggle" htmlFor="em-bar"><span><b>Search, filters and sort</b></span><input id="em-bar" type="checkbox" role="switch" checked={o.toolbar} onChange={(e) => set('toolbar')(e.target.checked)} /><i aria-hidden="true" /></label>
        <label className="am-toggle" htmlFor="em-enq"><span><b>“Ask about this course” form</b></span><input id="em-enq" type="checkbox" role="switch" checked={o.enquiry} onChange={(e) => set('enquiry')(e.target.checked)} /><i aria-hidden="true" /></label>
      </div>
      <pre className="wa-code" tabIndex={0} aria-label="Embed code">{code}</pre>
      {!k.origins.length && <p className="note" style={{ margin: 0, color: 'var(--red-ink)' }}>This key has no websites yet, so browsers will refuse it. Edit the key and add the website’s address.</p>}
      <h3 className="wa-h3">Live preview</h3>
      <Preview k={k} o={o} />
    </Dialog>
  );
}

function KeyDialog({ open, edit, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(blank);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF(edit ? { name: edit.name, origins: edit.origins.join('\n'), vendors: edit.vendors.join(', '), platforms: edit.platforms.join(', ') } : blank); setErr({}); } }, [open, edit]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true); setErr({});
    const body = { name: f.name, origins: lines(f.origins), vendors: lines(f.vendors), platforms: lines(f.platforms) };
    try { const k = edit ? await api.put('/api/admin/api-keys/' + edit.id, body) : await api.post('/api/admin/api-keys', body); toast(edit ? 'Key saved' : 'Key created'); onSaved(k, !edit); }
    catch (x) { setErr(x.fields || {}); if (!x.fields) toast(x.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} title={edit ? `Edit ${edit.name}` : 'New website key'} subtitle="One key per website. The key only works on the websites you list here." onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}><Icon name="save" small />{busy ? 'Saving…' : edit ? 'Save' : 'Create key'}</button></>}>
      <div className="form" style={{ gridTemplateColumns: '1fr' }}>
        <Field id="ak-name" label="Name" required value={f.name} onChange={set('name')} error={err.name} placeholder="e.g. Hazdemy website" />
        <Field id="ak-orig" label="Websites allowed to use it (one per line)" type="textarea" value={f.origins} onChange={set('origins')} error={err.origins} placeholder={'https://www.hazdemy.com\nhttps://hazdemy.com'} />
        <p className="note" style={{ margin: '-6px 0 0' }}>List both the www and the plain address if the site opens on both. Add test addresses too, e.g. http://localhost:8080.</p>
        <Field id="ak-ven" label="Only courses from these vendors (optional)" value={f.vendors} onChange={set('vendors')} placeholder="e.g. IBM, Microsoft — empty shows every vendor" />
        <Field id="ak-plat" label="Only these platforms (optional)" value={f.platforms} onChange={set('platforms')} placeholder="e.g. Data, Security — empty shows every platform" />
      </div>
    </Dialog>
  );
}

export default function WebsiteApi() {
  const toast = useToast();
  const { data, error, reload, setData } = useAdminData('/api/admin/api-keys');
  const t = useTable({ key: 'at', dir: -1 });
  const [form, setForm] = useState(null); // { edit }
  const [embed, setEmbed] = useState(null);
  const [shown, setShown] = useState({});
  const [ask, setAsk] = useState(null); // { kind: 'rotate' | 'delete' | 'enquiry', item }
  const [q, setQ] = useState('');
  const keys = data?.keys || [], enq = data?.enquiries || [];
  const rows = useMemo(() => { const s = q.trim().toLowerCase(); return sortRows(enq.filter((e) => !s || [e.name, e.email, e.company, e.course, e.site, e.message].join(' ').toLowerCase().includes(s)), t.sort); }, [enq, q, t.sort]);
  const replace = (k) => setData((d) => ({ ...d, keys: d.keys.some((x) => x.id === k.id) ? d.keys.map((x) => (x.id === k.id ? k : x)) : [...d.keys, k] }));
  const toggle = async (k) => { try { replace(await api.put('/api/admin/api-keys/' + k.id, { active: !k.active })); toast(k.active ? `${k.name} switched off` : `${k.name} switched on`); } catch (x) { toast(x.message); } };
  const confirm = async () => {
    const { kind, item } = ask;
    try {
      if (kind === 'rotate') { replace(await api.post(`/api/admin/api-keys/${item.id}/rotate`)); setShown((s) => ({ ...s, [item.id]: true })); toast('New key made. Update the embed code on the website.'); }
      if (kind === 'delete') { await api.del('/api/admin/api-keys/' + item.id); setData((d) => ({ ...d, keys: d.keys.filter((x) => x.id !== item.id) })); toast('Key deleted'); }
      if (kind === 'enquiry') { await api.del('/api/admin/enquiries/' + item.id); setData((d) => ({ ...d, enquiries: d.enquiries.filter((x) => x.id !== item.id) })); toast('Enquiry deleted'); }
    } catch (x) { toast(x.message); }
    setAsk(null);
  };
  const cols = [
    { key: 'at', label: 'Date', sortable: true, tdStyle: { whiteSpace: 'nowrap' }, render: (e) => fmtDay(e.at) },
    { key: 'name', label: 'From', sortable: true, render: (e) => <span className="two"><b style={{ color: 'var(--ink)' }}>{e.name}</b><a className="rowlink" href={`mailto:${e.email}?subject=${encodeURIComponent(e.subject || 'Your course enquiry')}`}>{e.email}</a>{(e.phone || e.company) && <span>{[e.phone, e.company].filter(Boolean).join(' · ')}</span>}</span> },
    { key: 'course', label: 'Course', sortable: true, tdStyle: { minWidth: 200 }, render: (e) => e.course || <span className="note">General enquiry</span> },
    { key: 'message', label: 'Message', tdStyle: { minWidth: 220, maxWidth: 360 }, render: (e) => <span className="wa-msg">{e.message || '—'}</span> },
    { key: 'site', label: 'Website', sortable: true, render: (e) => <span className="two"><span style={{ color: 'var(--ink)' }}>{e.site}</span>{e.origin && <span>{e.origin.replace(/^https?:\/\//, '')}</span>}</span> }
  ];
  const origin = window.location.origin;
  return (
    <>
      <PageHead eyebrow="Integrations" title="Website API" summary="Show your published courses live on your websites. Changes in Hazdemy appear on the sites straight away."
        actions={<button className="btn primary" onClick={() => setForm({})}><Icon name="plus" small />New website key</button>} />
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? !error && <Loading /> : (<>
        <Stats items={[['Website keys', num(keys.filter((k) => k.active).length), 'ok', `${num(keys.length)} in total`], ['API calls', num(keys.reduce((a, k) => a + k.calls, 0)), '', 'counted once a minute'], ['Website enquiries', num(enq.length), enq.length ? 'warn' : '']]} />
        {/^https?:\/\/(localhost|127\.|\[::1\])/.test(origin) && (
          <p className="wa-warn" role="note"><Icon name="globe" small />Hazdemy is running on this computer ({origin}), so live websites can’t reach it yet. Put Hazdemy online (for example on Render or Railway) and copy the embed code from there; the address in the code changes by itself.</p>
        )}
        <section className="wa-keys">
          {keys.length ? keys.map((k) => (
            <article key={k.id} className={`card wa-key${k.active ? '' : ' off'}`}>
              <div className="wa-top">
                <div><h2>{k.name}</h2><span className="note">{k.lastUsed ? `Last used ${ago(Date.parse(k.lastUsed))}${k.lastOrigin ? ' on ' + k.lastOrigin.replace(/^https?:\/\//, '') : ''} · ${num(k.calls)} calls` : 'Not used yet'}</span></div>
                <label className="am-toggle wa-on" htmlFor={'ak-on-' + k.id}><span><b>{k.active ? 'On' : 'Off'}</b></span><input id={'ak-on-' + k.id} type="checkbox" role="switch" checked={k.active} onChange={() => toggle(k)} aria-label={`${k.name} key switched ${k.active ? 'on' : 'off'}`} /><i aria-hidden="true" /></label>
              </div>
              <div className="wa-keyrow">
                <code>{shown[k.id] ? k.key : k.key.slice(0, 12) + '•'.repeat(16)}</code>
                <button className="icon-btn" onClick={() => setShown((s) => ({ ...s, [k.id]: !s[k.id] }))} title={shown[k.id] ? 'Hide key' : 'Show key'} aria-label={shown[k.id] ? 'Hide key' : 'Show key'}><Icon name="eye" small /></button>
                <button className="icon-btn" onClick={() => copy(k.key, toast, 'Key')} title="Copy key" aria-label={'Copy key for ' + k.name}><Icon name="copy" small /></button>
              </div>
              <dl className="wa-dl">
                <dt>Websites</dt><dd>{k.origins.length ? k.origins.map((o) => <span key={o} className="pill gone">{o.replace(/^https?:\/\//, '')}</span>) : <Tag tone="red">None: browsers are refused</Tag>}</dd>
                <dt>Courses</dt><dd>{k.vendors.length || k.platforms.length ? [k.vendors.length && 'Vendors: ' + k.vendors.join(', '), k.platforms.length && 'Platforms: ' + k.platforms.join(', ')].filter(Boolean).join(' · ') : 'All published courses'}</dd>
              </dl>
              <div className="actions">
                <button className="btn sm primary" onClick={() => setEmbed(k)} disabled={!k.active}><Icon name="link" small />Get embed code</button>
                <button className="btn sm" onClick={() => setForm({ edit: k })}><Icon name="edit" small />Edit</button>
                <button className="btn sm" onClick={() => setAsk({ kind: 'rotate', item: k })}><Icon name="reset" small />Replace key</button>
                <button className="btn sm ad-no" onClick={() => setAsk({ kind: 'delete', item: k })}><Icon name="trash" small />Delete</button>
              </div>
            </article>
          )) : <EmptyState title="No website keys yet" text="Create one key for each website that shows your courses." action={<button className="btn primary" onClick={() => setForm({})}><Icon name="plus" small />New website key</button>} />}
        </section>

        <section className="card wa-dev">
          <h2 style={{ margin: 0, fontSize: 16 }}><Icon name="net" small /> For website developers</h2>
          <p className="note" style={{ margin: 0 }}>The embed code is enough for most sites. Developers who want to build their own design can call the API directly. Send the key in the <code>X-API-Key</code> header or as <code>?key=</code>. Answers are JSON.</p>
          <ul className="wa-ep">
            <li><b>GET</b><code>/api/v1/courses</code><span>Published courses. Filters: <code>q</code>, <code>vendor</code>, <code>platform</code>, <code>product</code>, <code>level</code>, <code>delivery</code>; <code>sort</code> = name, rating, popular, newest, shortest, price; <code>limit</code> (max 100), <code>offset</code>.</span></li>
            <li><b>GET</b><code>/api/v1/courses/&#123;id or code&#125;</code><span>Full details: description, objectives, topics, outline, prerequisites, audience, instructors.</span></li>
            <li><b>GET</b><code>/api/v1/courses/&#123;id or code&#125;/outline.pdf</code><span>The course outline PDF.</span></li>
            <li><b>GET</b><code>/api/v1/filters</code><span>Vendors, platforms, products, levels and delivery types with course counts, for building filter menus.</span></li>
            <li><b>POST</b><code>/api/v1/enquiries</code><span>JSON <code>name</code>, <code>email</code>, optional <code>phone</code>, <code>company</code>, <code>course</code> (id or code), <code>message</code>. It appears in the list below.</span></li>
          </ul>
          <pre className="wa-code">{`curl "${origin}/api/v1/courses?platform=Data&sort=rating&limit=5" \\\n  -H "X-API-Key: ${keys[0]?.key.slice(0, 12) || 'atlas_pk_'}…"`}</pre>
        </section>

        <section className="card" style={{ padding: 0 }}>
          <div className="am-th"><h2>Website enquiries</h2>
            <button className="btn sm" disabled={!rows.length} onClick={() => downloadText(toCSV(rows, ['at', 'name', 'email', 'phone', 'company', 'course', 'message', 'site', 'origin']), 'atlas-website-enquiries.csv')}><Icon name="download" small />Export CSV</button></div>
          <div style={{ padding: '0 16px 12px' }}><SearchBox id="wa-q" value={q} onChange={(v) => { setQ(v); t.setPage(1); }} placeholder="Search name, email, course or message…" /></div>
          <DataTable cols={cols} rows={rows} {...t.props} noun="enquiries" empty={<EmptyState title={enq.length ? 'No enquiries match' : 'No enquiries yet'} text={enq.length ? 'Try other words.' : 'Requests sent from the “Ask about this course” form on the websites appear here.'} />}
            actions={(e) => <button onClick={() => setAsk({ kind: 'enquiry', item: e })} title="Delete" aria-label={'Delete enquiry from ' + e.name}><Icon name="trash" small /></button>} />
        </section>
      </>)}
      <KeyDialog open={!!form} edit={form?.edit} onClose={() => setForm(null)} onSaved={(k, isNew) => { replace(k); setForm(null); if (isNew) { setShown((s) => ({ ...s, [k.id]: true })); setEmbed(k); } }} />
      <EmbedDialog k={embed} onClose={() => setEmbed(null)} />
      <Confirm open={!!ask} onClose={() => setAsk(null)} onConfirm={confirm}
        title={ask?.kind === 'rotate' ? `Replace the key for ${ask.item.name}?` : ask?.kind === 'delete' ? `Delete ${ask?.item.name}?` : 'Delete this enquiry?'}
        message={ask?.kind === 'rotate' ? 'The old key stops working at once, so the course list on that website stays empty until you paste the new embed code.' : ask?.kind === 'delete' ? 'The course list on that website stops working at once.' : ask && `From ${ask.item.name} (${ask.item.email}).`}
        confirmLabel={ask?.kind === 'rotate' ? 'Replace key' : 'Delete'} />
    </>
  );
}
