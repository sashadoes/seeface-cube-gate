// SeeFace answers in JSON ({"reply": "...", "blueprint_patch": ..., "stage": ...}),
// but the artist should see the reply appear word by word. ReplyStream takes the
// raw JSON text as it streams and returns only the newly decoded characters of
// the "reply" string, so the chamber can show it before the JSON is complete.
export class ReplyStream {
  buf = "";
  pos = -1; // index of the first character of the reply's string value, -1 = not found yet
  done = false;

  push(chunk) {
    this.buf += chunk;
    if (this.done) return "";
    if (this.pos < 0) {
      const m = /"reply"\s*:\s*"/.exec(this.buf);
      if (!m) return "";
      this.pos = m.index + m[0].length;
    }
    let out = "";
    let i = this.pos;
    while (i < this.buf.length) {
      const c = this.buf[i];
      if (c === '"') {
        this.done = true;
        i++;
        break;
      }
      if (c !== "\\") {
        out += c;
        i++;
        continue;
      }
      // an escape: wait until it's complete
      const e = this.buf[i + 1];
      if (e === undefined) break;
      if (e === "u") {
        const hex = this.buf.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += { n: "\n", t: "\t", r: "", b: "", f: "", "/": "/", "\\": "\\", '"': '"' }[e] ?? e;
      i += 2;
    }
    this.pos = i;
    return out;
  }
}
