import { test } from "node:test";
import assert from "node:assert/strict";
import { ReplyStream } from "./stream.mjs";

const feed = (chunks) => {
  const s = new ReplyStream();
  return chunks.map((c) => s.push(c)).join("");
};

test("streams the reply string out of partial JSON", () => {
  assert.equal(feed(['{"rep', 'ly": "Hel', "lo, Mi", 'ra.", "blueprint_patch": null}']), "Hello, Mira.");
});

test("decodes escapes, even when split across chunks", () => {
  assert.equal(feed(['{"reply":"a \\', '"quoted\\" line\\nnext \\u00', "e9 \\\\ end", '"}']), 'a "quoted" line\nnext é \\ end');
});

test("ignores a reply key that appears after the reply", () => {
  assert.equal(feed(['{"reply":"one","blueprint_patch":{"tagline":"\\"reply\\": x"}}']), "one");
});

test("nothing before the reply key arrives", () => {
  const s = new ReplyStream();
  assert.equal(s.push('{"stage":"essence",'), "");
  assert.equal(s.push('"reply":"hi"}'), "hi");
});
