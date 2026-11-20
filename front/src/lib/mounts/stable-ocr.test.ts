import { describe, expect, it } from "vitest";
import { getMountFamily } from "@/lib/mounts/family";
import { readStableCapture, repairMountName } from "@/lib/mounts/stable-ocr";

const volkorne = getMountFamily("volkorne");
const line = (text: string, y: number) => ({ text, words: text.split(" ").map((word, index) => ({ text: word, box: { x: 10 + index * 100, y, width: 80, height: 12 } })) });

describe("stable OCR", () => {
  it("keeps clean names and completes the ones cut by the game", () => {
    expect(repairMountName("FPOORPOPOOROR", volkorne)).toEqual({ code: "FPOORPOPOOROR" });
    expect(repairMountName("MPOORPOPOOR...", volkorne)).toEqual({ code: "MPOORPOPOPOOR", from: "MPOORPOPOOR..." });
  });

  it("repairs common misreads against the name grammar", () => {
    expect(repairMountName("FTI-JIVTUTUIVIV", volkorne)?.code).toBe("FTUIVTUTUIVIV");
    expect(repairMountName("MP0ORP0P0OR0R", volkorne)?.code).toBe("MPOORPOPOOROR");
    expect(repairMountName("FlNlNSAUVSAUV", volkorne)?.code).toBe("FININSAUVSAUV");
    expect(repairMountName("MININSAUSAUV", volkorne)?.code).toBe("MININSAUVSAUV");
  });

  it("gives up rather than guess between two different mounts", () => {
    expect(repairMountName("FXXXXXXXXXXXX", volkorne)).toBeNull();
    expect(repairMountName("MPOOR", volkorne)).toBeNull();
    expect(repairMountName("MPOORPOPOOOR", volkorne)).toBeNull();
  });

  it("reads the names of a capture from top to bottom, ignoring the other columns", () => {
    const reading = readStableCapture(
      [line("GEN. 2", 20), line("MININSAUVSAUV", 50), line("FPOORPOPOOROR", 20), line("Niv. 40", 50), line("FTI-JIVTUTUIVIV GEN. 4", 80), line("F???", 110)],
      volkorne,
    );
    expect(reading.names).toEqual(["FPOORPOPOOROR", "MININSAUVSAUV", "FTUIVTUTUIVIV"]);
    expect(reading.corrected).toEqual([{ from: "FTI-JIVTUTUIVIV", to: "FTUIVTUTUIVIV" }]);
    expect(reading.unreadable).toEqual([]);
  });

  it("joins a name cut into several words", () => {
    expect(readStableCapture([line("MPOIN PO POI NIN", 20), line("GEN. 2", 20)], volkorne).names).toEqual(["MPOINPOPOININ"]);
  });

  it("flags a row whose name was not read", () => {
    const reading = readStableCapture([line("FAMINININAMAM", 20), line("GEN. 4", 20), line("POPO", 50), line("GEN. 2", 50), line("1", 70)], volkorne);
    expect(reading.names).toEqual(["FAMINININAMAM"]);
    expect(reading.unreadable).toEqual(["POPO"]);
  });
});
