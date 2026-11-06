import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { PageHead } from '../../components/ui.jsx';
import { useAdminData, SearchBox } from '../lib.jsx';

const GUIDES = [
  ['book', 'Courses', [
    ['How do I add a course?', <>Go to <Link to="/courses/new">Courses → New course</Link>, or bulk-import a spreadsheet with <b>Bulk import</b>. Code and name are required.</>],
    ['How do I fill a course from a Word outline?', <>On <Link to="/courses?outlines=1">Courses → Import outlines</Link>, drop one or more .docx or .doc files. Hazdemy matches each file to a course and fills topics, objectives and lessons; you review before applying.</>],
    ['How do I get a course PDF?', <>Open the course and click <b>Download PDF</b>. Save your changes first so the PDF includes them.</>],
    ['How is a course published?', <>Set its status to <b>Available</b> or <b>Published</b>. Courses in <b>For Review</b> show on the dashboard under Pending Approvals.</>]
  ]],
  ['people', 'Instructors & users', [
    ['How do instructors get access?', <>They request an account on the sign-in page and you approve it on the dashboard or the <Link to="/users">Users</Link> page. You can also create the user yourself and link it to an instructor profile.</>],
    ['How do I assign courses to an instructor?', <>Edit the instructor and pick courses under <b>Courses can teach</b>. Tick “Also assign” to add them as the course's instructor.</>]
  ]],
  ['cap', 'Learners & enrollments', [
    ['How do I enroll learners?', <>On <Link to="/enrollments">Enrollments</Link> or <Link to="/assignments">Assignments</Link>, click <b>Enroll learners</b> / <b>New assignment</b>, pick the course and paste their emails. A deadline is optional.</>],
    ['When is a certificate issued?', <>Automatically when a learner completes every lesson. All of them are on <Link to="/certificates">Certificates</Link> as PDFs.</>],
    ['How do I handle cash-on-delivery payments?', <>On <Link to="/payments">Payments</Link>, mark a pending COD payment as paid once the money is in. Turn COD off in <Link to="/settings">Site Settings</Link> when you go live with Razorpay.</>]
  ]],
  ['star', 'Ratings & reports', [
    ['Where do ratings come from?', <>Learners rate the course and the instructor after they start a course. Every rating feeds the course, instructor and dashboard figures straight away. Moderate them on <Link to="/reviews">Reviews &amp; Ratings</Link>.</>],
    ['Can I export data?', <>Every list has <b>Export CSV</b>. <Link to="/reports">Reports &amp; Analytics</Link> exports by platform, instructor and course, and <Link to="/settings">Site Settings</Link> downloads a full backup.</>]
  ]]
];

export default function Help() {
  const { data: site } = useAdminData('/api/site');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const s = q.trim().toLowerCase();
  const text = (n) => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join(' ') : n?.props ? text(n.props.children) : '');
  const groups = GUIDES.map(([ic, t, items]) => [ic, t, items.filter(([qq, a]) => !s || (qq + ' ' + text(a)).toLowerCase().includes(s))]).filter((g) => g[2].length);
  return (
    <>
      <PageHead eyebrow="Support" title="Help & Support" />
      <section className="am-help-top">
        <SearchBox id="hp-q" value={q} onChange={setQ} placeholder="Search help, e.g. “certificate” or “payment”…" />
        <div className="am-contact">
          <span><Icon name="mail" small />{site?.supportEmail ? <a href={'mailto:' + site.supportEmail}>{site.supportEmail}</a> : <span className="note">No support email yet</span>}</span>
          <span><Icon name="phone" small />{site?.supportPhone ? <a href={'tel:' + site.supportPhone.replace(/[^\d+]/g, '')}>{site.supportPhone}</a> : <span className="note">No support phone yet</span>}</span>
          <Link className="linkbtn" to="/settings">Edit in Site Settings →</Link>
        </div>
      </section>
      <section className="am-help">
        {groups.map(([ic, t, items]) => (
          <div key={t} className="card">
            <h2><span className="cico"><Icon name={ic} small /></span>{t}</h2>
            <ul className="am-faq">{items.map(([qq, a]) => (
              <li key={qq}><button type="button" aria-expanded={open === qq || !!s} onClick={() => setOpen(open === qq ? null : qq)}>{qq}<Icon name={open === qq || s ? 'up' : 'down'} small /></button>{(open === qq || s) && <p>{a}</p>}</li>
            ))}</ul>
          </div>
        ))}
        {!groups.length && <div className="card"><div className="empty"><Icon name="help" /><b>Nothing matches “{q}”</b><span>Try another word, or contact support.</span></div></div>}
      </section>
      <section className="card am-keys">
        <h2 style={{ margin: 0, fontSize: 15 }}>Keyboard shortcuts</h2>
        <span><kbd>/</kbd> Search courses and instructors</span><span><kbd>Ctrl</kbd> + <kbd>S</kbd> Save the course you're editing</span><span><kbd>Esc</kbd> Close a dialog or menu</span>
      </section>
    </>
  );
}
