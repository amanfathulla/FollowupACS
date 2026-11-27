import { test } from "node:test";
import { strictEqual, throws } from "node:assert";
import { renderMessageVariation, selectMessageMedia, validateImageSelection } from "./message-variations";

test("five images are accepted but a sixth is rejected", () => {
  validateImageSelection(0, 5);
  validateImageSelection(4, 1);
  throws(() => validateImageSelection(5, 1), /5 gambar/);
  throws(() => validateImageSelection(0, 6), /5 gambar/);
});
test("one random image is selected per recipient from all five alternatives", () => {
  const step = { media_type: "image", media_url: "old", media_urls: ["1", "2", "3", "4", "5"] };
  for (let index = 0; index < 5; index++) strictEqual(selectMessageMedia(step, () => (index + 0.1) / 5), String(index + 1));
});
test("legacy single media and non-image media retain their original file", () => {
  strictEqual(selectMessageMedia({ media_type: "image", media_url: "old" }), "old");
  strictEqual(selectMessageMedia({ media_type: "video", media_url: "video", media_urls: ["image"] }), "video");
});
test("enabled spintax selects different captions while preserving lead placeholders", () => {
  const template = "{Hi|Hello|Assalamualaikum} {{nama}}, {bro|sis}!";
  strictEqual(renderMessageVariation(template, true, { nama: "Ali" }, () => 0), "Hi Ali, bro!");
  strictEqual(renderMessageVariation(template, true, { nama: "Ali" }, () => 0.99), "Assalamualaikum Ali, sis!");
});
test("disabled spintax leaves caption choices unchanged", () => {
  strictEqual(renderMessageVariation("{Hi|Hello} {{nama}}", false, { nama: "Ali" }), "{Hi|Hello} Ali");
});
test("nested choices work and lead data is never interpreted as spintax", () => {
  strictEqual(renderMessageVariation("{Hi|{Hello|Salam}} {{nama}}", true, { nama: "{A|B}" }, () => 0.99), "Salam {A|B}");
});