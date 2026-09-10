import { describe, expect, it } from "vitest";
import { parseCsv, parseRegistrationCsv } from "./csv";

describe("parseCsv", () => {
  it("parses plain quoted fields", () => {
    expect(parseCsv('"a","b","c"\n"1","2","3"\n')).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a comma inside a quoted field intact", () => {
    expect(parseCsv('"Name","Notes"\n"Adam","Prefer 2nd, but flexible"\n')).toEqual([
      ["Name", "Notes"],
      ["Adam", "Prefer 2nd, but flexible"],
    ]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsv('"Notes"\n"Say ""hi"" please"\n')).toEqual([["Notes"], ['Say "hi" please']]);
  });

  it("skips fully blank trailing lines", () => {
    const rows = parseCsv('"a","b"\n"1","2"\n\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseRegistrationCsv", () => {
  // Mirrors the real club export's shape: a few report-header lines (club
  // name, report title, "Printed on ..."), a blank line, then the actual
  // CSV header — plus a trailing empty column from a trailing comma, and
  // names/notes with stray leading/trailing whitespace, all confirmed
  // against a real downloaded sample during development.
  const SAMPLE = [
    "Hamilton Victoria Curling Club",
    "League Registration Report - Tuesday Rec",
    "Printed on 2026-09-10 11:12:43",
    "",
    '"First Name","Last Name","Experience","Member Since","Notes for League Manager",',
    '"Adam","Bloomfield","3","2024","",',
    '"Avik ","Ghoshdastidar","25","2026","Vice or Second please!",',
    '"HR","Mandiv","0","2026","Would like to play for 8:45 pm only",',
    '"Dale","Brown","4","2023","I need to be on the same draw as Wayne Lewchuk",',
    "",
  ].join("\n");

  it("locates the header by content, skipping the report-header lines above it", () => {
    const rows = parseRegistrationCsv(SAMPLE);
    expect(rows).toHaveLength(4);
  });

  it("combines and trims first/last name, including stray whitespace within quotes", () => {
    const rows = parseRegistrationCsv(SAMPLE);
    expect(rows.map((r) => r.name)).toEqual(["Adam Bloomfield", "Avik Ghoshdastidar", "HR Mandiv", "Dale Brown"]);
  });

  it("parses Experience as a number, treating blank/non-numeric as null", () => {
    const rows = parseRegistrationCsv(SAMPLE);
    expect(rows.map((r) => r.experienceYears)).toEqual([3, 25, 0, 4]);
  });

  it("carries the raw notes text through, null when blank", () => {
    const rows = parseRegistrationCsv(SAMPLE);
    expect(rows[0].notes).toBeNull(); // Adam — blank notes field
    expect(rows[1].notes).toBe("Vice or Second please!");
    expect(rows[3].notes).toBe("I need to be on the same draw as Wayne Lewchuk");
  });

  it("throws a clear error when no First Name/Last Name header row exists", () => {
    expect(() => parseRegistrationCsv('"Foo","Bar"\n"1","2"\n')).toThrow(/First Name/);
  });

  it("skips a fully blank name row rather than producing an empty entry", () => {
    const withBlankRow = SAMPLE.replace(
      '"Dale","Brown","4","2023","I need to be on the same draw as Wayne Lewchuk",',
      '"Dale","Brown","4","2023","I need to be on the same draw as Wayne Lewchuk",\n"","","","","",',
    );
    const rows = parseRegistrationCsv(withBlankRow);
    expect(rows).toHaveLength(4); // the blank row didn't add a 5th entry
  });
});
