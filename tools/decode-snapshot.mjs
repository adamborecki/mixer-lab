// Usage: node tools/decode-snapshot.mjs <snapshot>   (or pipe it in)
// Turns a bug report's "Snapshot:" (deflate + base64 of the mixer state) back
// into JSON, to see exactly what the student's rig and mixer looked like.
import { inflateSync } from "node:zlib";

let text = process.argv[2] || "";
if (!text) for await (const chunk of process.stdin) text += chunk;
text = text.replace(/^.*Snapshot:\s*/s, "").trim();
console.log(JSON.stringify(JSON.parse(inflateSync(Buffer.from(text, "base64")).toString("utf8")), null, 2));
