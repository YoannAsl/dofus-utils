export type MountFamilyId = "dragodinde" | "muldo" | "volkorne";

export type Sex = "F" | "M";

export interface MountColour {
  id: string;
  /** Nom sans accent, tel qu'il sert aux codes de couleur. */
  name: string;
  generation: number;
  /** Couples de couleurs qui donnent celle-ci ; vide pour les G1, capturées. */
  recipes: [string, string][];
}

/** Monture lue depuis son nom de 13 lettres : sexe + couleur + 1er parent + 2e parent. */
export interface Mount {
  family: MountFamilyId;
  /** Nom normalisé, en majuscules. */
  code: string;
  sex: Sex;
  colourId: string;
  /** Code de 4 lettres de la couleur. */
  type: string;
  /** Vide pour une monture capturée (SAUVSAUV). */
  parentIds: string[];
  parentTypes: string[];
  wild: boolean;
}
