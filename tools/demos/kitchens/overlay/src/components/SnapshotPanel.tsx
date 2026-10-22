import { useStore } from '../store';

/** The 3D snapshots that feed the client presentation (cover, concept page, visualisations). Static: no rendering backend. */
export function SnapshotPanel() {
  const project = useStore((s) => s.project);
  const removeSnapshot = useStore((s) => s.removeSnapshot);
  const set = useStore((s) => s.set);

  return (
    <div className="render-panel no-print">
      <div className="render-head">
        <b>ויזואליזציות</b>
        <span className="muted">{project.snapshots.length} צילומים מהתלת-ממד · המצגת נבנית מהם ומהשרטוטים</span>
        <button className="btn small" onClick={() => set(() => ({ view: '3d' }))}>+ צלם עוד בתלת-ממד</button>
      </div>
      <div className="snap-grid">
        {project.snapshots.map((s) => (
          <div key={s.id} className="render-card">
            <img src={s.dataUrl} alt="" className="snap-img" />
            <div className="render-actions">
              <span className="muted">{s.name}</span>
              <button className="btn small danger" onClick={() => removeSnapshot(s.id)}>מחק</button>
            </div>
          </div>
        ))}
        {!project.snapshots.length && <div className="muted">אין צילומים עדיין – עברו לתלת-ממד ולחצו "צלם למצגת".</div>}
      </div>
    </div>
  );
}
