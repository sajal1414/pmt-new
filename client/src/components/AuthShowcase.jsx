import { useEffect, useRef } from 'react';

/** Login-page illustration: ATLAS cards floating in CSS 3D, tilting gently toward the pointer. */
export default function AuthShowcase() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const move = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3));
        el.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3));
      });
    };
    window.addEventListener('pointermove', move);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); };
  }, []);

  return (
    <div className="show" ref={ref} aria-hidden="true">
      <div className="show-stage">
        <div className="show-floor" />
        <div className="layer" style={{ '--z': '0px', left: '32%', top: '-4%', width: '66%' }}>
          <div className="show-card" style={{ '--d': '-2s' }}>
            <div className="sc-head"><b>Course catalog</b><span className="note">20 courses</span></div>
            <div className="sc-bars">{[62, 88, 45, 74, 96, 58, 80].map((h, i) => <i key={i} style={{ '--h': h + '%', '--i': i }} />)}</div>
          </div>
        </div>
        <div className="layer" style={{ '--z': '60px', left: '-4%', top: '26%', width: '80%' }}>
          <div className="show-card" style={{ '--d': '0s' }}>
            <div className="sc-head"><b>Data Integration with DataStage</b><span className="pill ok"><span className="d" />Available</span></div>
            <span className="note">6 lessons · 4h 30m · Virtual</span>
            <div className="sc-progress"><i /></div>
            <div className="sc-lessons">
              {['Introduction and architecture', 'Building your first ETL flow', 'Parallel jobs and performance'].map((t, i) => <div key={t}><span className="no">{i + 1}</span>{t}</div>)}
            </div>
          </div>
        </div>
        <div className="layer" style={{ '--z': '120px', left: '42%', top: '80%', width: '58%' }}>
          <div className="show-card sc-person" style={{ '--d': '-4s' }}>
            <span className="avatar">JM</span>
            <div><b>Jessica Miller</b><span className="note">DataStage · watsonx.data</span></div>
            <span className="sc-stars">★ 4.8</span>
          </div>
        </div>
        <span className="show-dot" style={{ '--z': '160px', left: '6%', top: '14%', '--d': '-1s' }} />
        <span className="show-dot sm" style={{ '--z': '90px', left: '94%', top: '48%', '--d': '-3s' }} />
        <span className="show-dot xs" style={{ '--z': '30px', left: '18%', top: '94%', '--d': '-5s' }} />
      </div>
    </div>
  );
}
