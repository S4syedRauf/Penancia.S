import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import { PHYSICAL_CHAMBERS, CALIBRATION_TARGETS } from './physicalCatalogues';

describe('Physical Catalogues Parity Test', () => {
  const csPath = resolve(__dirname, '../../../src/Penancia.S.Domain/Model/Catalogues.cs');
  const csSource = readFileSync(csPath, 'utf-8');

  // Extract C# ChamberType definitions:
  // new ChamberType(\s*Id:\s*"([^"]+)",\s*DisplayName:\s*"([^"]+)",\s*DepthUm:\s*([0-9.]+),\s*DatasheetUrl:\s*"([^"]+)"\s*\)
  const chamberRegex = /new\s*(?:ChamberType)?\s*\(\s*Id:\s*"([^"]+)",\s*DisplayName:\s*"([^"]+)",\s*DepthUm:\s*([0-9.]+),\s*DatasheetUrl:\s*"([^"]+)"\s*\)/g;
  const csChambers = new Map<string, { id: string; displayName: string; depthUm: number; datasheetUrl: string }>();
  let match: RegExpExecArray | null;
  while ((match = chamberRegex.exec(csSource)) !== null) {
    csChambers.set(match[1], {
      id: match[1],
      displayName: match[2],
      depthUm: parseFloat(match[3]),
      datasheetUrl: match[4],
    });
  }

  // Extract C# CalibrationTarget definitions:
  const targetRegex = /new\s*(?:CalibrationTarget)?\s*\(\s*Id:\s*"([^"]+)",\s*DisplayName:\s*"([^"]+)",\s*PitchUm:\s*([0-9.]+),\s*DatasheetUrl:\s*"([^"]+)"\s*\)/g;
  const csTargets = new Map<string, { id: string; displayName: string; pitchUm: number; datasheetUrl: string }>();
  while ((match = targetRegex.exec(csSource)) !== null) {
    csTargets.set(match[1], {
      id: match[1],
      displayName: match[2],
      pitchUm: parseFloat(match[3]),
      datasheetUrl: match[4],
    });
  }

  const tsChambers = new Map(PHYSICAL_CHAMBERS.map(c => [c.id, c]));
  const tsTargets = new Map(CALIBRATION_TARGETS.map(t => [t.id, t]));

  test('bidirectional chamber parity: id sets match both ways and DepthUm matches per id', () => {
    assert(csChambers.size > 0, 'No C# chambers extracted from Catalogues.cs');
    assert.equal(tsChambers.size, csChambers.size, `Chamber count mismatch: TS has ${tsChambers.size}, C# has ${csChambers.size}`);

    const csIds = Array.from(csChambers.keys()).sort();
    const tsIds = Array.from(tsChambers.keys()).sort();
    assert.deepEqual(tsIds, csIds, 'Chamber IDs mismatch between TS and C#');

    for (const id of tsIds) {
      const tsChamber = tsChambers.get(id)!;
      const csChamber = csChambers.get(id)!;
      assert.equal(tsChamber.depthUm, csChamber.depthUm, `DepthUm mismatch for chamber ${id}: TS=${tsChamber.depthUm}, C#=${csChamber.depthUm}`);
      assert.equal(tsChamber.displayName, csChamber.displayName, `DisplayName mismatch for chamber ${id}`);
      assert.equal(tsChamber.datasheetUrl, csChamber.datasheetUrl, `DatasheetUrl mismatch for chamber ${id}`);
    }
  });

  test('bidirectional calibration target parity: id sets match both ways and PitchUm matches per id', () => {
    assert(csTargets.size > 0, 'No C# calibration targets extracted from Catalogues.cs');
    assert.equal(tsTargets.size, csTargets.size, `Target count mismatch: TS has ${tsTargets.size}, C# has ${csTargets.size}`);

    const csIds = Array.from(csTargets.keys()).sort();
    const tsIds = Array.from(tsTargets.keys()).sort();
    assert.deepEqual(tsIds, csIds, 'Target IDs mismatch between TS and C#');

    for (const id of tsIds) {
      const tsTarget = tsTargets.get(id)!;
      const csTarget = csTargets.get(id)!;
      assert.equal(tsTarget.pitchUm, csTarget.pitchUm, `PitchUm mismatch for target ${id}: TS=${tsTarget.pitchUm}, C#=${csTarget.pitchUm}`);
      assert.equal(tsTarget.displayName, csTarget.displayName, `DisplayName mismatch for target ${id}`);
      assert.equal(tsTarget.datasheetUrl, csTarget.datasheetUrl, `DatasheetUrl mismatch for target ${id}`);
    }
  });
});
