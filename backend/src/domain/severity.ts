import type { HazardSeverity } from "@nearcast/shared";

/** NWS/CAP severity → normalized. Values are already CAP-standard. */
export function fromCapSeverity(raw: unknown): HazardSeverity {
  switch (String(raw ?? "").toLowerCase()) {
    case "extreme": return "extreme";
    case "severe": return "severe";
    case "moderate": return "moderate";
    case "minor": return "minor";
    default: return "unknown";
  }
}

/**
 * ECCC/MSC publishes alert tiers (warning/watch/advisory/statement), not CAP
 * severity. This is Nearcast's explicit translation of those tiers.
 */
export function fromEcccAlertType(alertType: unknown): HazardSeverity {
  switch (String(alertType ?? "").toLowerCase()) {
    case "warning": return "severe";
    case "watch": return "moderate";
    case "advisory": return "minor";
    case "statement": return "info";
    default: return "unknown";
  }
}

export interface WildfireStatus { code?: string; label: string; severity: HazardSeverity }

/** Canadian agency stage-of-control codes → label + Nearcast severity translation. */
export function fromStageOfControl(raw: unknown): WildfireStatus {
  const s = String(raw ?? "").trim().toUpperCase();
  switch (s) {
    case "OC": case "OOC": return { code: "OC", label: "Out of control", severity: "severe" };
    case "BH": return { code: "BH", label: "Being held", severity: "moderate" };
    case "UC": return { code: "UC", label: "Under control", severity: "minor" };
    case "OUT": case "EX": return { code: "OUT", label: "Out", severity: "info" };
    case "": return { label: "Unknown", severity: "unknown" };
    default: return { code: s, label: s, severity: "unknown" };
  }
}
