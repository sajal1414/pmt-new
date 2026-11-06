import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Dialog, Field } from './ui.jsx';
import { useToast } from '../lib/store.jsx';
import { GROUPS, groupOf } from '../lib/constants.js';
import { downloadCatalog } from '../lib/download.js';

const SHOW = [['ibmCode', 'IBM code'], ['duration', 'Duration'], ['delivery', 'Modality'], ['status', 'Status'], ['instructors', 'Instructor'], ['tagPortfolio', 'Portfolio tag'], ['tagProduct', 'Product tag'], ['tagLevel', 'Level tag'], ['tagVendor', 'Vendor tag'], ['description', 'Short description'], ['link', '“View Details” button']];
const TAGS = ['tagPortfolio', 'tagProduct', 'tagLevel', 'tagVendor'];
const DEFAULT_SHOW = ['contents', 'ibmCode', 'duration', 'delivery', 'status', 'instructors', ...TAGS, 'link'];
// choices saved before the tags were split: the single "tags" option becomes all four
const read = () => { try { const v = JSON.parse(localStorage.getItem('atlas-catalog-fields')) || DEFAULT_SHOW; return v.includes('tags') ? [...v.filter((k) => k !== 'tags'), ...TAGS] : v; } catch { return DEFAULT_SHOW; } };
const write = (v) => { try { localStorage.setItem('atlas-catalog-fields', JSON.stringify(v)); } catch { /* storage blocked */ } };
// courses are picked by platform and product; "platform|product" keys, compared without case or stray spaces
const tidy = (v) => String(v || '').trim();
const keyOf = (c) => `${tidy(c.platform).toLowerCase()}|${tidy(c.product).toLowerCase()}`;
const vendorOf = (c) => tidy(c.vendor).toLowerCase();
// the platform order arranged here, kept in this browser for next time (lower-case names; empty = A–Z)
const readOrder = () => { try { const v = JSON.parse(localStorage.getItem('atlas-catalog-platforms')); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeOrder = (v) => { try { localStorage.setItem('atlas-catalog-platforms', JSON.stringify(v)); } catch { /* storage blocked */ } };

/**
 * Course Catalog PDF options, shared by the admin Courses page and the instructor's My Courses page.
 * `scopes` = [[key, label, courses[]], ...]: which set of courses to start from.
 */
export default function CatalogDialog({ open, onClose, scopes, defaultScope }) {
  const toast = useToast();
  const [scope, setScope] = useState(scopes[0]?.[0]);
  const [groups, setGroups] = useState(GROUPS.map((g) => g.id));
  const [fields, setFields] = useState(read);
  const [title, setTitle] = useState('Hazdemy Course Catalog');
  const [busy, setBusy] = useState(false);
  const [offProducts, setOffProducts] = useState(() => new Set()); // product keys left out of the catalog
  const [offVendors, setOffVendors] = useState(() => new Set()); // vendors left out (lower-case; '' = no vendor)
  const [find, setFind] = useState('');
  const [platOrder, setPlatOrderState] = useState(readOrder);
  const setPlatOrder = (v) => { setPlatOrderState(v); writeOrder(v); };
  useEffect(() => { if (open) { setScope(defaultScope && scopes.some((s) => s[0] === defaultScope) ? defaultScope : scopes[0]?.[0]); setOffProducts(new Set()); setOffVendors(new Set()); setFind(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = scopes.find((s) => s[0] === scope) || scopes[0];
  const byStatus = useMemo(() => (pick ? pick[2].filter((c) => groups.includes(groupOf(c.status).id)) : []), [pick, groups]);
  // vendors with their course counts; the platforms and products below only show the ticked vendors' courses
  const vendors = useMemo(() => {
    const m = new Map();
    for (const c of byStatus) { const k = vendorOf(c), v = m.get(k) || { key: k, name: tidy(c.vendor) || 'No vendor', n: 0 }; v.n++; m.set(k, v); }
    return [...m.values()].sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.name.localeCompare(b.name));
  }, [byStatus]);
  const noVendor = vendors.length > 0 && vendors.every((v) => offVendors.has(v.key)); // nothing ticked: every vendor is included
  const byVendor = useMemo(() => (noVendor ? byStatus : byStatus.filter((c) => !offVendors.has(vendorOf(c)))), [byStatus, offVendors, noVendor]);
  const flipVendor = (k) => setOffVendors((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const list = useMemo(() => { const some = byVendor.some((c) => !offProducts.has(keyOf(c))); return some ? byVendor.filter((c) => !offProducts.has(keyOf(c))) : byVendor; }, [byVendor, offProducts]); // no product ticked: every product
  // platforms with their products and course counts (from the courses the status choice leaves)
  const tree = useMemo(() => {
    const m = new Map();
    for (const c of byVendor) {
      const pk = tidy(c.platform).toLowerCase(), plat = m.get(pk) || { key: pk, name: tidy(c.platform) || 'No platform', n: 0, products: new Map() };
      const k = keyOf(c), prod = plat.products.get(k) || { key: k, name: tidy(c.product) || 'No product', n: 0 };
      prod.n++; plat.n++; plat.products.set(k, prod); m.set(pk, plat);
    }
    const rank = (k) => { const i = platOrder.indexOf(k); return i < 0 ? 1e6 : i; };
    return [...m.values()].map((p) => ({ ...p, products: [...p.products.values()].sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => rank(a.key) - rank(b.key) || (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.name.localeCompare(b.name));
  }, [byVendor, platOrder]);
  // move a platform up or down; the new order of every platform listed is kept
  const movePlatform = (key, d) => {
    const keys = tree.map((p) => p.key), i = keys.indexOf(key), j = i + d;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setPlatOrder([...keys, ...platOrder.filter((k) => !keys.includes(k))]);
  };
  const q = find.trim().toLowerCase();
  const shown = q ? tree.map((p) => ({ ...p, products: p.name.toLowerCase().includes(q) ? p.products : p.products.filter((x) => x.name.toLowerCase().includes(q)) })).filter((p) => p.products.length) : tree;
  const allKeys = tree.flatMap((p) => p.products.map((x) => x.key));
  const setOn = (keys, on) => setOffProducts((s) => { const n = new Set(s); for (const k of keys) { if (on) n.delete(k); else n.add(k); } return n; });
  const pickedProducts = allKeys.filter((k) => !offProducts.has(k)).length, noProduct = allKeys.length > 0 && !pickedProducts;
  const toggle = (arr, set, k) => set(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  const setF = (k) => { const next = fields.includes(k) ? fields.filter((x) => x !== k) : [...fields, k]; setFields(next); write(next); };
  const download = async (format) => {
    setBusy(format);
    try {
      const everything = pick[0] === 'all' && groups.length === GROUPS.length && (noProduct || !offProducts.size) && (noVendor || !offVendors.size);
      const excluded = GROUPS.filter((g) => !groups.includes(g.id)).map((g) => g.short.toLowerCase());
      const sendFields = noVendor && !fields.includes('hideVendor') ? [...fields, 'hideVendor'] : fields; // no vendor chosen = leave vendors out
      await downloadCatalog({ format, ids: everything ? undefined : list.map((c) => c.id), title, fields: sendFields, platformOrder: platOrder.length ? tree.map((p) => p.key) : undefined,
        subtitle: [pick[0] === 'all' ? 'All courses' : pick[1].replace(/ \(.*\)$/, ''), excluded.length ? `excluding ${excluded.join(', ')}` : '', offVendors.size && !noVendor ? vendors.filter((v) => !offVendors.has(v.key)).map((v) => v.name).join(' & ') : '', offProducts.size && !noProduct ? `${pickedProducts} of ${allKeys.length} products` : ''].filter(Boolean).join(', ') });
      toast(`Catalog ${format === 'xlsx' ? 'Excel file' : 'PDF'} with ${list.length} course${list.length === 1 ? '' : 's'} downloaded`); onClose();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} wide title="Course Catalog" subtitle="PDF (A4) or Excel, grouped by Vendor › Platform › Portfolio, with both logos on the first page. Choose what to include."
      footer={<>
        <span className="note cat-count">{list.length} course{list.length === 1 ? '' : 's'}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!!busy || !list.length} onClick={() => download('xlsx')}><Icon name="table" small />{busy === 'xlsx' ? 'Creating…' : 'Download Excel'}</button>
        <button className="btn primary" disabled={!!busy || !list.length} onClick={() => download('pdf')}><Icon name="download" small />{busy === 'pdf' ? 'Creating…' : 'Download PDF'}</button>
      </>}>
      <div className="form" style={{ gridTemplateColumns: '1fr' }}>
        <Field id="cat-title" label="Title on the cover" value={title} onChange={setTitle} />
        <fieldset className="cat-set"><legend>Which courses</legend>
          {scopes.map(([k, l, items]) => <label key={k} className="cat-opt"><input type="radio" name="cat-scope" checked={scope === k} onChange={() => setScope(k)} /><span>{l}</span><b className="num">{items.length}</b></label>)}
        </fieldset>
        <fieldset className="cat-set"><legend>Include courses that are</legend>
          <div className="cat-cols">{GROUPS.map((g) => { const n = pick ? pick[2].filter((c) => groupOf(c.status).id === g.id).length : 0; return (
            <label key={g.id} className="cat-opt"><input type="checkbox" checked={groups.includes(g.id)} onChange={() => toggle(groups, setGroups, g.id)} /><span className={`pill ${g.tone}`}><span className="d" />{g.label}</span><b className="num">{n}</b></label>
          ); })}</div>
        </fieldset>
        <fieldset className="cat-set"><legend>Vendors <span className="note">{noVendor ? '(none chosen: all courses are included, without vendor headings)' : `(${vendors.length - vendors.filter((v) => offVendors.has(v.key)).length} of ${vendors.length})`}</span></legend>
          <div className="cat-pbar">
            <div className="cat-prods" style={{ margin: 0 }}>{vendors.map((v) => (
              <label key={v.key || '-'} className={`cat-prod${offVendors.has(v.key) ? '' : ' on'}`}>
                <input type="checkbox" checked={!offVendors.has(v.key)} onChange={() => flipVendor(v.key)} />{v.name}<span className="num">{v.n}</span>
              </label>
            ))}</div>
            <span className="grow" />
            {vendors.length > 1 && <>
              <button type="button" className="btn sm" disabled={!offVendors.size} onClick={() => setOffVendors(new Set())}><Icon name="check" small />Select all</button>
              <button type="button" className="btn sm" disabled={offVendors.size === vendors.length} onClick={() => setOffVendors(new Set(vendors.map((v) => v.key)))}><Icon name="x" small />Clear all</button>
            </>}
          </div>
        </fieldset>
        <fieldset className="cat-set"><legend>Platforms &amp; products <span className="note">{noProduct ? `(none chosen, so all are included · ${list.length} courses)` : `(${pickedProducts} of ${allKeys.length} products · ${list.length} courses)`}</span></legend>
          <div className="cat-pbar">
            <label className="field grow" htmlFor="cat-find"><Icon name="search" small /><span className="sr">Find a platform or product</span>
              <input id="cat-find" type="search" placeholder="Find a platform or product…" value={find} onChange={(e) => setFind(e.target.value)} autoComplete="off" /></label>
            <button type="button" className="btn sm" onClick={() => setOn(q ? shown.flatMap((p) => p.products.map((x) => x.key)) : allKeys, true)}><Icon name="check" small />{q ? 'Select these' : 'Select all'}</button>
            <button type="button" className="btn sm" onClick={() => setOn(q ? shown.flatMap((p) => p.products.map((x) => x.key)) : allKeys, false)}><Icon name="x" small />{q ? 'Clear these' : 'Clear all'}</button>
            <button type="button" className="btn sm" disabled={!platOrder.length} onClick={() => setPlatOrder([])} title="Put the platforms back in alphabetical order"><Icon name="sort" small />A–Z</button>
          </div>
          <p className="note" style={{ margin: '0 0 8px' }}>Use the arrows to arrange the platforms: the catalog shows them in this order.</p>
          <div className="cat-tree">
            {shown.map((p) => {
              const keys = p.products.map((x) => x.key), on = keys.filter((k) => !offProducts.has(k)).length;
              return (
                <div key={p.key} className="cat-plat">
                  <div className="cat-ph">
                    <span className="cat-pos" aria-hidden="true">{tree.findIndex((t) => t.key === p.key) + 1}</span>
                    <label>
                      <input type="checkbox" checked={on === keys.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < keys.length; }} onChange={() => setOn(keys, on !== keys.length)} />
                      <b>{p.name}</b>
                    </label>
                    <span className="num">{p.products.filter((x) => !offProducts.has(x.key)).reduce((a, x) => a + x.n, 0)} of {p.n}</span>
                    <span className="rowact">
                      <button type="button" onClick={() => movePlatform(p.key, -1)} disabled={tree[0]?.key === p.key} aria-label={`Move ${p.name} up`} title="Move up"><Icon name="up" small /></button>
                      <button type="button" onClick={() => movePlatform(p.key, 1)} disabled={tree[tree.length - 1]?.key === p.key} aria-label={`Move ${p.name} down`} title="Move down"><Icon name="down" small /></button>
                    </span>
                  </div>
                  <div className="cat-prods">{p.products.map((x) => (
                    <label key={x.key} className={`cat-prod${offProducts.has(x.key) ? '' : ' on'}`}>
                      <input type="checkbox" checked={!offProducts.has(x.key)} onChange={() => setOn([x.key], offProducts.has(x.key))} />{x.name}<span className="num">{x.n}</span>
                    </label>
                  ))}</div>
                </div>
              );
            })}
            {!shown.length && <p className="note" style={{ margin: 0 }}>{tree.length ? `Nothing matches “${find}”.` : 'No courses with the statuses and vendors chosen above.'}</p>}
          </div>
        </fieldset>
        <fieldset className="cat-set"><legend>Show on each course (Course # and name are always shown)</legend>
          <div className="cat-cols two">{SHOW.map(([k, l]) => <label key={k} className="cat-opt"><input type="checkbox" checked={fields.includes(k)} onChange={() => setF(k)} /><span>{l}</span></label>)}</div>
        </fieldset>
        <fieldset className="cat-set"><legend>Catalog</legend>
          <label className="cat-opt"><input type="checkbox" checked={fields.includes('contents')} onChange={() => setF('contents')} /><span>Contents list on the first page</span></label>
          <label className="cat-opt"><input type="checkbox" checked={noVendor || fields.includes('hideVendor')} disabled={noVendor} title={noVendor ? 'No vendor is chosen above, so vendors are left out' : undefined} onChange={() => setF('hideVendor')} /><span>Leave out vendors <span className="note">(group by platform › portfolio, no vendor headings or column)</span></span></label>
        </fieldset>
      </div>
    </Dialog>
  );
}
