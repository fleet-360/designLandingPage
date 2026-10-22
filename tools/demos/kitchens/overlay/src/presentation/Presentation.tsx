/** Client presentation (A3 landscape pages, print = PDF) of the public demo: a generic kitchen studio, no prices.
 *  Replaces the app's presentation as a whole (see REPLACES in tools/demos/kitchens/build.py). */
import { useMemo, type ReactNode } from 'react';
import { describe } from '../data/catalog';
import { useCatalog } from '../data/useCatalog';
import { CARCASSES, HANDLES, PLINTHS, WORKTOPS, frontColour, isHandleFree, pick, programme, type Colour } from '../data/finishes';
import { layout, priceEntry } from '../model/layout';
import { FUNC_LABELS, useStore, type Project, type WallId } from '../store';
import { ElevationSVG, PlanSVG, elevationForIsland, elevationForWall } from '../views/drawings';
import { SnapshotPanel } from '../components/SnapshotPanel';
import { MaterialFan } from '../components/MaterialFan';
import './presentation.css';

const STUDIO = 'kitchen studio';
const NOTE = 'Generated in the kitchen studio demo by Pro Algorithm. Plans, elevations and the unit list come from one model; dimensions to be verified on site.';

function Page({ section, title, n, project, children, className = '' }: { section?: string; title?: string; n: number; project: Project; children: ReactNode; className?: string }) {
  return (
    <section className={`page ${className}`}>
      {section !== undefined && (
        <header className="page-head">
          <div className="crumbs"><span className="section">{section}</span>{title && <> | <b>{title}</b></>}</div>
          <div className="client">{project.client}</div>
        </header>
      )}
      <div className="page-body">{children}</div>
      <footer className="page-foot">
        <div className="logo">{STUDIO} <span>{project.showroom}</span></div>
        <div className="disclaimer">{NOTE}</div>
        <div className="pageno">{n}</div>
      </footer>
    </section>
  );
}

function Swatch({ c, label, sub, big = false }: { c: Colour; label: string; sub?: string; big?: boolean }) {
  return (
    <div className={`legend-item ${big ? 'big' : ''}`}>
      <div className={`dot ${c.texture ?? ''}`} style={{ background: c.hex }} />
      <div>
        <div className="legend-name">{c.name.toUpperCase()}</div>
        <div className="legend-sub">{label}{sub ? ` · ${sub}` : ''}</div>
      </div>
    </div>
  );
}

function Legend({ project }: { project: Project }) {
  const f = project.finishes;
  const prog = programme(f.frontProgramme);
  return (
    <div className="legend">
      <Swatch c={frontColour(f)} label="Fronts" sub={prog.name} />
      <Swatch c={pick(WORKTOPS, f.worktop)} label="Worktops" />
      <Swatch c={pick(HANDLES, f.handle)} label={isHandleFree(f) ? 'Opening' : 'Handles'} />
      <Swatch c={pick(PLINTHS, f.plinth)} label="Plinths" />
      <Swatch c={pick(CARCASSES, f.carcass)} label="Carcass" />
    </div>
  );
}

export function Presentation() {
  const project = useStore((s) => s.project);
  const catalog = useCatalog();
  const placements = useMemo(() => layout(project, catalog.byCode), [project, catalog]);
  const walls = (['A', 'B', 'C', 'D'] as WallId[]).filter((w) => project.runs.some((r) => r.kind === 'wall' && r.wall === w && r.units.length));
  const islands = project.runs.filter((r) => r.kind === 'island' && r.units.length);
  const pics = project.snapshots.map((s) => s.render ?? s.dataUrl);
  const hero = pics[pics.length - 1];
  const f = project.finishes;
  const prog = programme(f.frontProgramme);
  const { width, depth, height } = project.room;

  const toc: string[] = ['The proposal | Design concept', 'Main kitchen | Materials', 'Materials | Material fan', 'Main kitchen | Plan',
    ...walls.map((w) => `Main kitchen | Elevation ${w}`),
    ...islands.flatMap((r) => [`${r.name} | Elevation front`, `${r.name} | Elevation rear`]),
    'Main kitchen | Visualisations', 'Specification | Units'];
  let n = 1;
  const date = new Date(project.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase().replace(/ /g, ' | ');
  const opening = isHandleFree(f) ? 'handle-free touch fronts' : `${pick(HANDLES, f.handle).name.toLowerCase()}s`;

  return (
    <div className="presentation">
      <SnapshotPanel />
      {/* cover */}
      <Page n={n++} project={project} className="cover">
        <div className="cover-image" style={hero ? { backgroundImage: `url(${hero})` } : undefined}>
          {!hero && <div className="cover-placeholder">צלמו תמונה בתצוגה התלת-ממדית כדי להציג אותה כאן</div>}
        </div>
        <div className="cover-text">
          <div className="brand">{STUDIO}</div>
          <div className="cover-client">{project.client}</div>
          <div className="cover-title">{project.name}</div>
          <div className="cover-meta">A PROJECT BY {project.designer.toUpperCase()}<br />{date}<br />ITERATION #{String(project.iteration).padStart(2, '0')}</div>
        </div>
      </Page>

      {/* concept */}
      <Page n={n++} project={project} section="THE PROPOSAL" title="DESIGN CONCEPT">
        <div className="two-col">
          <div className="brand-image" style={hero ? { backgroundImage: `url(${hero})` } : undefined} />
          <div className="prose">
            <p>A kitchen of {placements.length} units in a room of {width / 1000} × {depth / 1000} m with a ceiling height of {height / 1000} m: {walls.length} wall {walls.length === 1 ? 'run' : 'runs'}{islands.length ? ` and ${islands.length === 1 ? 'an island' : `${islands.length} islands`}` : ''}.</p>
            <p>Fronts in {prog.name.toLowerCase()}, colour {frontColour(f).name}, with {pick(WORKTOPS, f.worktop).name.toLowerCase()} worktops and {opening}. Appliances and storage sit behind one continuous line of fronts.</p>
            <p>Every unit is a catalogue article with its real dimensions, and the plan, the elevations, the visualisations and the unit list on the following pages are drawn from the same model. This is iteration #{String(project.iteration).padStart(2, '0')} of the proposal for {project.client}.</p>
          </div>
        </div>
      </Page>

      {/* contents */}
      <Page n={n++} project={project} section="CONTENT">
        <div className="toc">
          <div className="toc-head"><span>PROJECT LAYOUT:</span><span>PAGE</span></div>
          {toc.map((t, i) => <div key={i} className="toc-row"><span>{t.toUpperCase()}</span><span>{String(i + 2).padStart(2, '0')}</span></div>)}
        </div>
      </Page>

      {/* materials */}
      <Page n={n++} project={project} section="MAIN KITCHEN" title="MATERIALS">
        <div className="materials">
          {[
            { c: frontColour(f), l: 'FRONTS', s: prog.name },
            { c: pick(WORKTOPS, f.worktop), l: 'WORKTOPS', s: 'Island top, run worktops' },
            { c: pick(HANDLES, f.handle), l: isHandleFree(f) ? 'OPENING' : 'HANDLES', s: isHandleFree(f) ? 'Touch opening, no handles' : '196 mm, 25 mm below the top edge' },
            { c: pick(PLINTHS, f.plinth), l: 'PLINTHS', s: 'Base and tall units' },
            { c: pick(CARCASSES, f.carcass), l: 'CARCASS', s: 'Interior and visible sides' },
          ].map((m, i) => (
            <div key={i} className="material-card">
              <div className={`material-swatch ${m.c.texture ?? ''}`} style={{ background: m.c.hex }} />
              <div className="material-name">{m.c.name.toUpperCase()}</div>
              <div className="material-role">{m.l}</div>
              <div className="material-sub">{m.s}</div>
            </div>
          ))}
        </div>
      </Page>

      {/* material fan */}
      <Page n={n++} project={project} section="MATERIALS" title="MATERIAL FAN">
        <MaterialFan finishes={f} compact />
      </Page>

      {/* plan */}
      <Page n={n++} project={project} section="GROUND FLOOR" title="MAIN KITCHEN PLAN">
        <div className="plan-page"><PlanSVG project={project} catalog={catalog} className="fill" mono /></div>
      </Page>

      {/* elevations */}
      {walls.map((w) => (
        <Page key={w} n={n++} project={project} section="MAIN KITCHEN" title={`ELEVATION ${w}`}>
          <div className="elev-page">
            <Legend project={project} />
            <div className="elev-main">
              <ElevationSVG data={elevationForWall(project, catalog, w)} project={project} className="fill" mono />
              <div className="plan-strip">
                <div className="strip-title">PLAN VIEW</div>
                <PlanSVG project={project} catalog={catalog} className="fill" showLabels={false} mono />
              </div>
            </div>
          </div>
        </Page>
      ))}
      {islands.flatMap((r) => (['front', 'back'] as const).map((side) => (
        <Page key={r.id + side} n={n++} project={project} section="MAIN KITCHEN" title={`${r.name.toUpperCase()} ELEVATION ${side === 'front' ? 'FRONT' : 'REAR'}`}>
          <div className="elev-page">
            <Legend project={project} />
            <div className="elev-main">
              <ElevationSVG data={elevationForIsland(project, catalog, r, side)} project={project} className="fill" backdrop={false} mono />
              <div className="plan-strip">
                <div className="strip-title">PLAN VIEW</div>
                <PlanSVG project={project} catalog={catalog} className="fill" showLabels={false} mono />
              </div>
            </div>
          </div>
        </Page>
      )))}

      {/* visuals */}
      <Page n={n++} project={project} section="MAIN KITCHEN" title="VISUALISATIONS">
        <div className={`shots shots-${Math.min(project.snapshots.length, 4) || 1}`}>
          {project.snapshots.length ? project.snapshots.slice(-4).map((s) => <div key={s.id} className="shot" style={{ backgroundImage: `url(${s.render ?? s.dataUrl})` }} />)
            : <div className="cover-placeholder">צלמו תמונות בתצוגה התלת-ממדית כדי להציג אותן כאן</div>}
        </div>
      </Page>

      {/* spec */}
      <Page n={n++} project={project} section="SPECIFICATION" title="UNITS">
        <table className="spec-table">
          <thead><tr><th>#</th><th>Position</th><th>Article</th><th>Description</th><th>Function</th><th>W × D × H</th></tr></thead>
          <tbody>
            {placements.map((p, i) => (
              <tr key={p.unit.id}>
                <td>{i + 1}</td>
                <td>{p.run.name}</td>
                <td><code>{p.article.code}</code></td>
                <td>{describe(p.article, priceEntry(p.article.code, catalog.prices))}{p.unit.note ? ` – ${p.unit.note}` : ''}</td>
                <td>{p.unit.func ? FUNC_LABELS[p.unit.func].en : ''}</td>
                <td>{p.w} × {p.d} × {p.h}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={6}>{placements.length} units</td></tr>
          </tfoot>
        </table>
      </Page>

      {/* thank you */}
      <Page n={n++} project={project} className="thanks">
        <div className="thanks-body">
          <div className="small">THANK YOU</div>
          <div className="brand">{STUDIO}</div>
          <div className="thanks-meta">{project.showroom.toUpperCase()}<br />{project.designer}</div>
        </div>
      </Page>
    </div>
  );
}
