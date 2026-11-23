/**
 * Physical catalogues for Penancia.S Frontend.
 * Strictly maintains 1:1 parity with src/Penancia.S.Domain/Model/Catalogues.cs.
 * Every product is backed by an authoritative manufacturer datasheet URL.
 */

export interface ChamberType {
  id: string;
  displayName: string;
  depthUm: number;
  datasheetUrl: string;
}

export interface CalibrationTarget {
  id: string;
  displayName: string;
  pitchUm: number;
  datasheetUrl: string;
}

export const PHYSICAL_CHAMBERS: readonly ChamberType[] = [
  {
    id: 'leja-sc-20-01-02-b-ce',
    displayName: 'Leja SC 20-01-02-B-CE (20 µm 2-chamber)',
    depthUm: 20.0,
    datasheetUrl: 'https://leja.nl/wp-content/uploads/2023/06/DOC-3.3-01-10-2023-04-24-Leja-slides-General-CE-User-Manual.pdf',
  },
  {
    id: 'vitrolife-microcell-15423',
    displayName: 'Vitrolife MicroCell REF 15423 (20 µm 2-chamber)',
    depthUm: 20.0,
    datasheetUrl: 'https://www.vitrolife.com/globalassets/support-documents/product-manuals/microcell_user_manual-en-gb.pdf',
  },
] as const;

export const CALIBRATION_TARGETS: readonly CalibrationTarget[] = [
  {
    id: 'thorlabs-r1l3s2p',
    displayName: '1 mm scale, 10 µm divisions',
    pitchUm: 10.0,
    datasheetUrl: 'https://www.thorlabs.com/item/R1L3S2P',
  },
] as const;

export const UNLISTED_CHAMBER_ID = 'unlisted-chamber';
export const UNLISTED_CHAMBER_LABEL = 'My chamber is not listed';
