// Usage: node tools/verify-submission.mjs < submission.txt
// Recomputes the check code of a pasted Mixer Lab Canvas submission.
import { verifySubmission } from "../js/submission.js";

let text = "";
for await (const chunk of process.stdin) text += chunk;
const r = verifySubmission(text);
console.log(r.ok ? `OK: ${r.name}, ${r.done} / ${r.total} scenarios` : `INVALID: ${r.reason}`);
process.exit(r.ok ? 0 : 1);
