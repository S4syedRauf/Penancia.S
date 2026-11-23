import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import { PHYSICAL_CHAMBERS, CALIBRATION_TARGETS } from './physicalCatalogues';

describe('Physical Catalogues Parity Test', () => {
  const csPath = resolve(__dirname, '../../../src/Penancia.S.Domain/Model/Catalogues.cs');
  const csSource = readFileSync(csPath, 'utf-8');

  test('matches all chamber types defined in Catalogues.cs', () => {
    assert(PHYSICAL_CHAMBERS.length > 0);
    for (const chamber of PHYSICAL_CHAMBERS) {
      assert(csSource.includes(`Id: "${chamber.id}"`), `Missing chamber ID ${chamber.id}`);
      assert(csSource.includes(`DisplayName: "${chamber.displayName}"`), `Missing display name for ${chamber.id}`);
      assert(csSource.includes(`DepthUm: ${chamber.depthUm.toFixed(1)}`), `Missing depth for ${chamber.id}`);
      assert(csSource.includes(`DatasheetUrl: "${chamber.datasheetUrl}"`), `Missing datasheet URL for ${chamber.id}`);
    }
  });

  test('matches all calibration targets defined in Catalogues.cs', () => {
    assert(CALIBRATION_TARGETS.length > 0);
    for (const target of CALIBRATION_TARGETS) {
      assert(csSource.includes(`Id: "${target.id}"`), `Missing target ID ${target.id}`);
      assert(csSource.includes(`DisplayName: "${target.displayName}"`), `Missing display name for ${target.id}`);
      assert(csSource.includes(`PitchUm: ${target.pitchUm.toFixed(1)}`), `Missing pitch for ${target.id}`);
      assert(csSource.includes(`DatasheetUrl: "${target.datasheetUrl}"`), `Missing datasheet URL for ${target.id}`);
    }
  });
});
