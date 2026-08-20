import { describe, expect, it } from "vitest";
import {
  divisionFromSpeeldag,
  divisionSortKey,
  formatDivisionDisplayName,
  speeldagNumberFromLabel,
} from "./competitionDivision";

describe("divisionFromSpeeldag", () => {
  it("leest de reeks uit een Kuurne-speeldag", () => {
    expect(divisionFromSpeeldag("Eerste klasse – Speeldag 1")).toBe(
      "Eerste klasse",
    );
    expect(divisionFromSpeeldag("Tweede klasse - Speeldag 11")).toBe(
      "Tweede klasse",
    );
  });

  it("geeft null zonder reeksprefix", () => {
    expect(divisionFromSpeeldag("Speeldag 1")).toBeNull();
    expect(divisionFromSpeeldag(null)).toBeNull();
  });
});

describe("divisionSortKey", () => {
  it("zet Eerste vóór Tweede", () => {
    expect(divisionSortKey("Eerste klasse") < divisionSortKey("Tweede klasse")).toBe(
      true,
    );
  });
});

describe("formatDivisionDisplayName", () => {
  it("hernoemt klasse naar reeks", () => {
    expect(formatDivisionDisplayName("Eerste klasse")).toBe("Eerste reeks");
    expect(formatDivisionDisplayName("Tweede klasse")).toBe("Tweede reeks");
  });
});

describe("speeldagNumberFromLabel", () => {
  it("leest het speeldagnummer", () => {
    expect(speeldagNumberFromLabel("Eerste klasse – Speeldag 3")).toBe(3);
    expect(speeldagNumberFromLabel("Speeldag 11")).toBe(11);
    expect(speeldagNumberFromLabel("Overige")).toBeNull();
  });
});
