import { describe, expect, it } from "vitest";
import { getMountFamily } from "@/lib/mounts/family";
import { appendCapture, readStableCapture, repairMountName } from "@/lib/mounts/stable-ocr";

const volkorne = getMountFamily("volkorne");
const line = (text: string, y: number) => ({ text, words: text.split(" ").map((word, index) => ({ text: word, box: { x: 10 + index * 100, y, width: 80, height: 12 } })) });

describe("stable OCR", () => {
  it("keeps clean names and completes the ones cut by the game", () => {
    expect(repairMountName("FPOORPOPOOROR", volkorne)).toEqual({ code: "FPOORPOPOOROR" });
    expect(repairMountName("MPOORPOPOOR...", volkorne)).toEqual({ code: "MPOORPOPOPOOR", from: "MPOORPOPOOR..." });
  });

  it("repairs common misreads against the name grammar", () => {
    // Lu par Windows OCR sur une capture agrandie : le U de TU est devenu « I-J ».
    expect(repairMountName("FTI-JIVTUTUIVIV", volkorne)?.code).toBe("FTUIVTUTUIVIV");
    expect(repairMountName("MP0ORP0P0OR0R", volkorne)?.code).toBe("MPOORPOPOOROR");
    expect(repairMountName("FlNlNSAUVSAUV", volkorne)?.code).toBe("FININSAUVSAUV");
    expect(repairMountName("MININSAUSAUV", volkorne)?.code).toBe("MININSAUVSAUV");
  });

  it("gives up rather than guess between two different mounts", () => {
    expect(repairMountName("FXXXXXXXXXXXX", volkorne)).toBeNull();
    expect(repairMountName("MPOOR", volkorne)).toBeNull();
    // Une lettre perdue : « …OROR » ou « …POOR », une seule correction chacun.
    expect(repairMountName("MPOORPOPOOOR", volkorne)).toBeNull();
  });

  it("reads the names of a capture from top to bottom, ignoring the other columns", () => {
    const reading = readStableCapture(
      [line("GEN. 2", 20), line("MININSAUVSAUV", 50), line("FPOORPOPOOROR", 20), line("Niv. 40", 50), line("FTI-JIVTUTUIVIV GEN. 4", 80), line("F???", 110)],
      volkorne,
    );
    expect(reading.names).toEqual(["FPOORPOPOOROR", "MININSAUVSAUV", "FTUIVTUTUIVIV"]);
    expect(reading.corrected).toEqual([{ from: "FTI-JIVTUTUIVIV", to: "FTUIVTUTUIVIV" }]);
  });

  it("counts the rows seen on both sides of a scroll only once", () => {
    expect(appendCapture(["A", "B", "C"], ["B", "C", "D"])).toEqual({ names: ["A", "B", "C", "D"], overlap: 2 });
    expect(appendCapture(["A", "A"], ["A", "B"])).toEqual({ names: ["A", "A", "B"], overlap: 1 });
    expect(appendCapture([], ["A"])).toEqual({ names: ["A"], overlap: 0 });
  });
});
