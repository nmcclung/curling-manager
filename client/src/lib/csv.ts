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
};

// The registration tool's export leads with a few report-header lines
// (club name, report title, "Printed on ...", a blank line) before the
// actual CSV header — so we locate the header row by content ("First
// Name"/"Last Name" columns) rather than assuming a fixed line count,
// since that framing text isn't guaranteed stable across reports.
export function parseRegistrationCsv(text: string): RegistrationRow[] {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((c) => c.trim().toLowerCase());
    return normalized.includes("first name") && normalized.includes("last name");
  });
  if (headerIndex === -1) {
    throw new Error('Could not find a header row with "First Name" / "Last Name" columns in this file.');
  }

  const header = rows[headerIndex].map((c) => c.trim());
  const firstNameIdx = header.findIndex((c) => c.toLowerCase() === "first name");
  const lastNameIdx = header.findIndex((c) => c.toLowerCase() === "last name");
  const experienceIdx = header.findIndex((c) => c.toLowerCase() === "experience");
  const notesIdx = header.findIndex((c) => c.toLowerCase() === "notes for league manager");

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

    result.push({ name, experienceYears, notes });
  }
  return result;
}
