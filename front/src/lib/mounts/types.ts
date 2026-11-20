export type MountFamilyId = "dragodinde" | "muldo" | "volkorne";

export type Sex = "F" | "M";

export interface MountColour {
  id: string;
  name: string;
  generation: number;
  recipes: [string, string][];
}

export interface Mount {
  family: MountFamilyId;
  code: string;
  sex: Sex;
  colourId: string;
  type: string;
  parentIds: string[];
  parentTypes: string[];
  wild: boolean;
}
