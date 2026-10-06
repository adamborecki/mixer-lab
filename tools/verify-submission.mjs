// Usage: node tools/verify-submission.mjs < submission.txt
// Recomputes the check code of a pasted Mixer Lab Canvas submission: the v2
// export or Assignment 1's original format.
import { verifySubmission } from "../js/submission.js";
import { verifyExport } from "../js/export.js";
import { duration } from "../js/submission.js";

let text = "";
for await (const chunk of process.stdin) text += chunk;
const v2 = verifyExport(text);
const r = v2.ok || v2.reason !== "not a Mixer Lab v2 export" ? v2 : verifySubmission(text);
if (r.ok && r.preview) console.log(`WARNING: made on branch preview "${r.preview}", not the assignment site`);
if (!r.ok) console.log(`INVALID: ${r.reason}`);
else if (r.solved !== undefined) console.log(`OK: ${r.name}, ${r.total ? `${duration(r.total.sec)} active, ${r.total.actions} actions, ` : ""}${r.solved} scenarios solved, ${r.bugs} bug report(s)`);
else console.log(`OK: ${r.name}, ${r.done} / ${r.total} scenarios (Assignment 1 format)`);
process.exit(r.ok ? 0 : 1);
