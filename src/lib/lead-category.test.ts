import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { getLeadCategory, leadStatusPatch } from "./lead-category";

test("marking a prospect converted updates the same record to the converted category", () => {
  const lead = { id: "same-lead", lead_type: "prospect", followup_status: "active" };
  const updated = { ...lead, ...leadStatusPatch("converted") };
  strictEqual(updated.id, "same-lead");
  strictEqual(getLeadCategory(updated), "converted");
  strictEqual([updated].filter((row) => getLeadCategory(row) === "prospect").length, 0);
  strictEqual([updated].filter((row) => getLeadCategory(row) === "converted").length, 1);
});

test("legacy converted leads do not appear in the not-yet-purchased category", () => {
  strictEqual(getLeadCategory({ lead_type: "prospect", followup_status: "converted" }), "converted");
});

test("reactivating a converted customer's followup does not move them back to prospects", () => {
  const updated = { lead_type: "converted", ...leadStatusPatch("active") };
  strictEqual(getLeadCategory(updated), "converted");
  deepStrictEqual(leadStatusPatch("active"), { followup_status: "active" });
});