// Track names: by instrument ("Drums", DRUMS) or by the musician who plays it
// on the recording ("Eli Furie", ELI), as the student chooses. Every view asks
// here instead of reading a source's `name` / `shortName` directly.

let mode = "parts"; // "parts" | "musicians"

export const NAME_MODES = ["parts", "musicians"];
export const nameMode = () => mode;
export function setNameMode(m) {
  mode = NAME_MODES.includes(m) ? m : "parts";
}

const byMusician = (src) => mode === "musicians" && !!src?.musician;

// The long name: "Eli Furie" or "Drums".
export const sourceName = (src) => (byMusician(src) ? src.musician : src?.name || "");
// A channel strip's label: "ELI" or "DRUMS".
export const sourceShort = (src) => (byMusician(src) ? src.musicianShort || src.musician : src?.shortName || "");
// The other name, for a subtitle or tooltip: the part when showing musicians, and the reverse.
export const sourceAlt = (src) => (byMusician(src) ? src.name : src?.musician || "");
