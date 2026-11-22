export type LeadCategory = "prospect" | "converted";
export type LeadStatus = "active" | "replied" | "converted" | "stopped";

export function leadStatusPatch(status: LeadStatus) {
  return status === "converted"
    ? { followup_status: status, lead_type: "converted" as const }
    : { followup_status: status };
}

// Treat legacy converted statuses as customers until their next saved update.
export function getLeadCategory(lead: { lead_type?: string | null; followup_status?: string }): LeadCategory {
  return lead.lead_type === "converted" || lead.followup_status === "converted" ? "converted" : "prospect";
}