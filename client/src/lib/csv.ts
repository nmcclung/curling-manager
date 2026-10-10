// Minimal RFC4180-ish CSV parser (quoted fields, "" as an escaped quote, no
// multi-line fields) — same approach as server/prisma/seed.ts's parser,
// just living client-side since roster import parses in the browser.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type RegistrationRow = {
  name: string;
  experienceYears: number | null;
  notes: string | null;
  canPlaySkip: boolean;
  canPlayVice: boolean;
  canPlaySecond: boolean;
  canPlayLead: boolean;
  isNewCurler: boolean;
  active: boolean;
};

// The club's season-start roster export: First Name, Last Name, Experience,
// Notes for League Manager, Can Play Skip?/Vice?/Second?/Lead?, New Curler?,
// Active?, Our notes (that last column is the club's own internal
// bookkeeping and deliberately not imported — confirmed with the user).
// Unlike an earlier mid-season "League Registration Report" export this
// importer briefly supported, this one carries real position-eligibility,
// new-curler, and active signal directly, so it's taken as-is rather than
// forced to a manual-review default. Header is located by content ("First
// Name"/"Last Name" columns) rather than assumed to be row 1, in case a
// future export reintroduces report-preamble lines.
export function parseRegistrationCsv(text: string): RegistrationRow[] {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((c) => c.trim().toLowerCase());
    return normalized.includes("first name") && normalized.includes("last name");
  });
  if (headerIndex === -1) {
    throw new Error('Could not find a header row with "First Name" / "Last Name" columns in this file.');
  }

  const header = rows[headerIndex].map((c) => c.trim().toLowerCase());
  const colIdx = (label: string) => header.findIndex((c) => c === label);
  const firstNameIdx = colIdx("first name");
  const lastNameIdx = colIdx("last name");
  const experienceIdx = colIdx("experience");
  const notesIdx = colIdx("notes for league manager");
  const skipIdx = colIdx("can play skip?");
  const viceIdx = colIdx("can play vice?");
  const secondIdx = colIdx("can play second?");
  const leadIdx = colIdx("can play lead?");
  const newCurlerIdx = colIdx("new curler?");
  const activeIdx = colIdx("active?");

  const parseBool = (v: string | undefined) => (v ?? "").trim().toLowerCase() === "true";

  const result: RegistrationRow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const firstName = (row[firstNameIdx] ?? "").trim();
    const lastName = (row[lastNameIdx] ?? "").trim();
    const name = `${firstName} ${lastName}`.trim();
    if (!name) continue; // blank trailing line, etc.

    const rawExperience = experienceIdx >= 0 ? row[experienceIdx]?.trim() : "";
    const experienceYears = rawExperience && /^\d+$/.test(rawExperience) ? Number(rawExperience) : null;

    const rawNotes = notesIdx >= 0 ? row[notesIdx]?.trim() : "";
    const notes = rawNotes || null;

    result.push({
      name,
      experienceYears,
      notes,
      canPlaySkip: parseBool(row[skipIdx]),
      canPlayVice: parseBool(row[viceIdx]),
      canPlaySecond: parseBool(row[secondIdx]),
      canPlayLead: parseBool(row[leadIdx]),
      isNewCurler: parseBool(row[newCurlerIdx]),
      active: activeIdx >= 0 ? parseBool(row[activeIdx]) : false,
    });
  }
  return result;
}
