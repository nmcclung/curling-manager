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
  // Mirrors the real club export's season-start roster shape: header is
  // row 1 (no report-header preamble, unlike an earlier mid-season export
  // this importer briefly supported), with explicit Can Play Skip/Vice/
  // Second/Lead, New Curler, and Active boolean columns plus a trailing
  // "Our notes" column that's deliberately NOT imported (club-internal
  // bookkeeping, confirmed with the user) — and a stray-whitespace name to
  // confirm trimming still works.
  const SAMPLE = [
    '"First Name","Last Name","Experience","Notes for League Manager","Can Play Skip?","Can Play Vice?","Can Play Second?","Can Play Lead?","New Curler?","Active?","Our notes"',
    '"Adam","Bloomfield","3","","TRUE","FALSE","FALSE","FALSE","FALSE","TRUE","club note A"',
    '"Avik ","Ghoshdastidar","25","Vice or Second please!","FALSE","TRUE","TRUE","FALSE","FALSE","TRUE","club note B"',
    '"HR","Mandiv","0","Would like to play for 8:45 pm only","FALSE","FALSE","FALSE","TRUE","TRUE","TRUE",""',
    '"Dale","Brown","4","I need to be on the same draw as another player","FALSE","FALSE","TRUE","TRUE","FALSE","FALSE",""',
    "",
  ].join("\n");

  it("parses every data row", () => {
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

  it("carries the raw 'Notes for League Manager' text through, null when blank, ignoring 'Our notes'", () => {
    const rows = parseRegistrationCsv(SAMPLE);
    expect(rows[0].notes).toBeNull(); // Adam — blank notes field
    expect(rows[1].notes).toBe("Vice or Second please!");
    expect(rows[3].notes).toBe("I need to be on the same draw as another player");
  });

  it("parses the Can Play Skip/Vice/Second/Lead boolean columns", () => {
    const rows = parseRegistrationCsv(SAMPLE);
    expect(rows.map((r) => [r.canPlaySkip, r.canPlayVice, r.canPlaySecond, r.canPlayLead])).toEqual([
      [true, false, false, false],
      [false, true, true, false],
      [false, false, false, true],
      [false, false, true, true],
    ]);
  });

  it("parses New Curler? and Active?", () => {
    const rows = parseRegistrationCsv(SAMPLE);
    expect(rows.map((r) => r.isNewCurler)).toEqual([false, false, true, false]);
    expect(rows.map((r) => r.active)).toEqual([true, true, true, false]);
  });

  it("throws a clear error when no First Name/Last Name header row exists", () => {
    expect(() => parseRegistrationCsv('"Foo","Bar"\n"1","2"\n')).toThrow(/First Name/);
  });

  it("skips a fully blank name row rather than producing an empty entry", () => {
    const withBlankRow = SAMPLE.replace(
      '"Dale","Brown","4","I need to be on the same draw as another player","FALSE","FALSE","TRUE","TRUE","FALSE","FALSE",""',
      '"Dale","Brown","4","I need to be on the same draw as another player","FALSE","FALSE","TRUE","TRUE","FALSE","FALSE",""\n"","","","","FALSE","FALSE","FALSE","FALSE","FALSE","FALSE",""',
    );
    const rows = parseRegistrationCsv(withBlankRow);
    expect(rows).toHaveLength(4); // the blank row didn't add a 5th entry
  });
});
