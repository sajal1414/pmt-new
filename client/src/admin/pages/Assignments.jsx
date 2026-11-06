import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Dialog, PageHead } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useToast } from '../../lib/store.jsx';
import { useAdminData, Loading, ErrorNote, Stats, Tag, Progress, AssignDialog, SearchBox, num, fmtDay, today } from '../lib.jsx';

/** Courses assigned to learners (by an admin or an instructor), grouped by course and deadline. */
export default function Assignments() {
  const toast = useToast();
  const { data, error, reload } = useAdminData('/api/admin/assignments');
  const [q, setQ] = useState('');
  const [show, setShow] = useState('all');
  const [open, setOpen] = useState(null); // group id
  const [assigning, setAssigning] = useState(null); // { courseId } | {}
  const [dl, setDl] = useState(null); // { group, deadline }
  const list = data || [];
  const now = today(), soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const state = (g) => (g.done === g.total ? 'Completed' : g.overdue ? 'Overdue' : g.deadline && g.deadline <= soon ? 'Due soon' : 'Open');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((g) => (!s || [g.course, g.code, g.assignedBy, ...g.learners.map((l) => l.student + ' ' + l.email)].join(' ').toLowerCase().includes(s)) && (show === 'all' || state(g) === show));
  }, [list, q, show]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveDeadline = async () => {
    try { await api.put('/api/admin/assignments/deadline', { ids: dl.group.learners.map((l) => l.id), deadline: dl.deadline }); toast('Deadline updated for ' + dl.group.total + ' learner' + (dl.group.total === 1 ? '' : 's')); setDl(null); reload(); } catch (x) { toast(x.message); }
  };
  return (
    <>
      <PageHead eyebrow="Learning operations" title="Assignments" actions={<button className="btn primary" onClick={() => setAssigning({})}><Icon name="plus" small />New assignment</button>} />
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? !error && <Loading /> : (<>
        <Stats items={[['Assignments', num(list.length)], ['Learners assigned', num(list.reduce((a, g) => a + g.total, 0))], ['Completed', num(list.reduce((a, g) => a + g.done, 0)), 'ok'],
          ['Due in 7 days', num(list.filter((g) => state(g) === 'Due soon').length), 'warn'], ['Overdue learners', num(list.reduce((a, g) => a + g.overdue, 0)), list.some((g) => g.overdue) ? 'red' : '']]} />
        <section className="toolbar" aria-label="Filters">
          <SearchBox id="as-q" value={q} onChange={setQ} placeholder="Search course or learner…" />
          <div className="seg-row" role="group" aria-label="Show">{[['all', 'All'], ['Open', 'Open'], ['Due soon', 'Due soon'], ['Overdue', 'Overdue'], ['Completed', 'Completed']].map(([k, l]) => <button key={k} type="button" className="seg" aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>)}</div>
        </section>
        {rows.length ? <section className="am-groups">{rows.map((g) => (
          <article key={g.id} className="card am-group">
            <div className="am-group-h">
              <div className="am-group-t"><Link className="rowlink" to={'/courses/' + g.courseId}><b>{g.course}</b></Link><span className="note">{g.code} · assigned by {g.assignedBy} on {fmtDay(g.assigned)}</span></div>
              <Tag tone={{ Completed: 'ok', Overdue: 'red', 'Due soon': 'warn', Open: 'acc' }[state(g)]}>{state(g)}</Tag>
            </div>
            <div className="am-group-m">
              <span><Icon name="cal" small />{g.deadline ? <>Due <b>{fmtDay(g.deadline)}</b>{g.deadline < now && g.done < g.total && <span style={{ color: 'var(--red-ink)' }}> (passed)</span>}</> : 'No deadline'}</span>
              <span><Icon name="people" small /><b className="num">{g.total}</b> learner{g.total === 1 ? '' : 's'} · {g.done} done · {g.started} in progress · {g.notStarted} not started</span>
              <Progress value={g.avgProgress} />
            </div>
            <div className="am-group-a">
              <button className="btn sm" onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id}><Icon name={open === g.id ? 'up' : 'down'} small />{open === g.id ? 'Hide learners' : 'Show learners'}</button>
              <button className="btn sm" onClick={() => setDl({ group: g, deadline: g.deadline })}><Icon name="cal" small />Change deadline</button>
              <button className="btn sm" onClick={() => setAssigning({ courseId: g.courseId })}><Icon name="plus" small />Add learners</button>
            </div>
            {open === g.id && <ul className="am-learners">{g.learners.map((l) => (
              <li key={l.id}><span className="two"><b>{l.student}</b><span>{l.email}</span></span><Progress value={l.progress} /><Tag>{l.status}</Tag></li>
            ))}</ul>}
          </article>
        ))}</section> : <div className="card"><div className="empty"><Icon name="doc" /><b>{list.length ? 'No assignments match' : 'No assignments yet'}</b><span>{list.length ? 'Try another filter.' : 'Assign a course to learners with a deadline, and track who has finished it here.'}</span>{!list.length && <button className="btn sm primary" onClick={() => setAssigning({})}><Icon name="plus" small />New assignment</button>}</div></div>}
      </>)}
      <AssignDialog open={!!assigning} courseId={assigning?.courseId} onClose={() => setAssigning(null)} onDone={reload} />
      <Dialog open={!!dl} onClose={() => setDl(null)} title="Change the deadline" subtitle={dl && `${dl.group.course} · ${dl.group.total} learner${dl.group.total === 1 ? '' : 's'}`}
        footer={<><button className="btn" onClick={() => setDl(null)}>Cancel</button><button className="btn primary" onClick={saveDeadline}>Save deadline</button></>}>
        {dl && <div className="fg"><label htmlFor="as-dl">New deadline (leave empty for none)</label><input id="as-dl" type="date" value={dl.deadline} onChange={(e) => setDl((s) => ({ ...s, deadline: e.target.value }))} /></div>}
      </Dialog>
    </>
  );
}
