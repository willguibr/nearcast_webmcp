export const PREP_KEY = "nearcast.preparation.v1";
export const PREPARATION = [
  { id: "plan", title: "Household plan", items: [
    { id: "contacts", text: "Agree on household meeting places and an out-of-area contact." },
    { id: "needs", text: "Plan for medications, accessibility needs, pets and important documents." },
    { id: "alerts", text: "Know where your local authority publishes alerts and evacuation instructions." },
  ] },
  { id: "kit", title: "Emergency kit & grab-and-go bag", items: [
    { id: "supplies", text: "Review water, food and other household supplies using the PreparedBC checklist." },
    { id: "bag", text: "Prepare a portable bag with essential medication, copies of documents and basic supplies." },
    { id: "power", text: "Check flashlights, batteries, phone chargers and power banks." },
  ] },
  { id: "wildfire", title: "Wildfire preparation", items: [
    { id: "firesmart", text: "Review the FireSmart home guide and clear accumulated debris from roofs and gutters." },
    { id: "bulletins", text: "Review local fire prohibitions and official area restrictions before outdoor activities." },
  ] },
  { id: "winter", title: "Winter & power outages", items: [
    { id: "vehicle", text: "Review your vehicle emergency kit, warm layers and winter travel plan." },
    { id: "detectors", text: "Test smoke and carbon monoxide alarms and review safe backup heating guidance." },
  ] },
  { id: "earthquake", title: "Earthquake preparation", items: [
    { id: "practice", text: "Review and practise Drop, Cover and Hold On." },
    { id: "secure", text: "Review how to secure heavy furniture and other household hazards." },
  ] },
] as const;
export const PREP_IDS: string[] = PREPARATION.flatMap((s) => s.items.map((i) => i.id));
export function parsePreparation(raw: string | null): string[] {
  try { const v = JSON.parse(raw ?? "null"); return v?.version === 1 && Array.isArray(v.checked) ? [...new Set<string>(v.checked.filter((x: unknown) => typeof x === "string" && PREP_IDS.includes(x)))] : []; }
  catch { return []; }
}
