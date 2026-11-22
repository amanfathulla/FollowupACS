import { describe, test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { findImportDuplicates } from "./import-duplicates";

describe("bulk import duplicate phone notification", () => {
  test("lists repeated numbers with their occurrence counts for copying", () => {
    deepStrictEqual(findImportDuplicates([
      { name: "Ali", phone: "0123456789" },
      { name: "Abu", phone: "0123456789" },
      { name: "Siti", phone: "0198765432" },
    ]), [{ phone: "60123456789", originals: ["0123456789"], names: ["Ali", "Abu"], count: 2 }]);
  });
  test("matches equivalent local and international phone formats", () => {
    strictEqual(findImportDuplicates([
      { name: "Ali", phone: "012-345 6789" },
      { name: "Abu", phone: "+60123456789" },
      { name: "Amin", phone: "123456789" },
    ])[0]?.count, 3);
  });
  test("does not flag distinct numbers", () => {
    deepStrictEqual(findImportDuplicates([{ name: "Ali", phone: "0123456789" }, { name: "Abu", phone: "0123456788" }]), []);
  });
});