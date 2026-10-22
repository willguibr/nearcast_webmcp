import { useAppState } from "../hooks/useStore.ts";
import { store } from "../state/index.ts";
import { PREPARATION, PREP_IDS } from "../state/preparation.ts";
export function Preparation() {
  const checked = useAppState((s) => s.preparation);
  return <section className="panel preparation"><details><summary>Preparation checklist · {checked.length}/{PREP_IDS.length}</summary>
    <p className="muted small">A household planning aid, saved in this browser. Completion does not certify readiness or replace official instructions.</p>
    <progress value={checked.length} max={PREP_IDS.length} aria-label="Checklist progress" />
    {PREPARATION.map((section) => <fieldset key={section.id}><legend>{section.title}</legend>{section.items.map((item) => <label key={item.id} className="prep-item"><input type="checkbox" checked={checked.includes(item.id)} onChange={(e) => store.setPreparation(item.id, e.target.checked)} />{item.text}</label>)}</fieldset>)}
    <p className="small">Review the full <a href="https://www2.gov.bc.ca/gov/content/safety/emergency-management/preparedbc" target="_blank" rel="noreferrer">PreparedBC guidance ↗</a> and <a href="https://firesmartbc.ca/" target="_blank" rel="noreferrer">FireSmart BC guidance ↗</a>.</p>
  </details></section>;
}
