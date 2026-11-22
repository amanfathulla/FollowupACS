import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { findImportDuplicates, removeImportRow } from "./import-duplicates";

test("removing a preview name removes only that row and recalculates duplicate numbers", () => {
  const rows = [{ name: "Ali", phone: "0123456789" }, { name: "Abu", phone: "60123456789" }, { name: "Siti", phone: "0198765432" }];
  strictEqual(findImportDuplicates(rows).length, 1);
  const remaining = removeImportRow(rows, 1);
  deepStrictEqual(remaining.map((row) => row.name), ["Ali", "Siti"]);
  strictEqual(findImportDuplicates(remaining).length, 0);
  strictEqual(rows.length, 3);
});

test("removing the final preview row leaves no lead to import", () => {
  strictEqual(removeImportRow([{ name: "Ali", phone: "0123456789" }], 0).length, 0);
});