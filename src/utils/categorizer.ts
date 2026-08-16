import { Patch, Multi } from '../types';

/**
 * Derives an appropriate group/category name for a patch based on its ID, name,
 * synth engine, and voice parameter characteristics.
 */
export function getAutoCategoryForPatch(patch: Patch): string {
  const id = patch.id.toLowerCase();
  const name = patch.name.toLowerCase();
  const engine = patch.params?.synthEngine || 'jupiter';

  // 1. Duran Duran Signatures
  if (id.startsWith('duran-') || name.includes('duran') || id.includes('duran')) {
    return 'Duran Duran';
  }

  // 2. Organs
  if (
    engine === 'hammond' ||
    id.includes('organ') ||
    id.includes('b3') ||
    name.includes('organ') ||
    name.includes('b3') ||
    name.includes('vox') ||
    name.includes('farfisa') ||
    name.includes('cathedral') ||
    name.includes('pipe') ||
    name.includes('whiter shade') ||
    name.includes('jimmy jazz') ||
    name.includes('deep purple') ||
    name.includes('ocarina')
  ) {
    return 'Organs';
  }

  // 3. Basses
  if (
    id.includes('bass') ||
    name.includes('bass') ||
    name.includes('sub') ||
    name.includes('acid') ||
    name.includes('techno hammer')
  ) {
    return 'Basses';
  }

  // 4. Leads
  if (
    id.includes('lead') ||
    name.includes('lead') ||
    name.includes('solo') ||
    name.includes('shredder') ||
    name.includes('sync lead') ||
    name.includes('tri-lead') ||
    name.includes('laser shredder')
  ) {
    return 'Leads';
  }

  // 5. Pads & Strings
  if (
    id.includes('pad') ||
    id.includes('string') ||
    name.includes('pad') ||
    name.includes('string') ||
    name.includes('clouds') ||
    name.includes('vangelis') ||
    name.includes('solina') ||
    name.includes('orchestral') ||
    name.includes('space') ||
    name.includes('journey') ||
    name.includes('sweeps') ||
    name.includes('fragile') ||
    name.includes('breathy')
  ) {
    return 'Pads & Strings';
  }

  // 6. Brass
  if (
    id.includes('brass') ||
    name.includes('brass') ||
    name.includes('horn') ||
    name.includes('trumpet')
  ) {
    return 'Brass';
  }

  // 7. Keys & E-Pianos
  if (
    id.includes('keys') ||
    id.includes('ep') ||
    id.includes('piano') ||
    name.includes('piano') ||
    name.includes('keys') ||
    name.includes('wurlitzer') ||
    name.includes('pluck') ||
    name.includes('bell') ||
    name.includes('marimba') ||
    name.includes('chimes') ||
    name.includes('tubular') ||
    name.includes('retro poly') ||
    name.includes('flute') ||
    name.includes('harmonica')
  ) {
    return 'Keys & E-Pianos';
  }

  // 8. Arpeggiators & Sequences
  if (
    id.includes('arp') ||
    name.includes('arp') ||
    name.includes('chasing') ||
    name.includes('pulse') ||
    name.includes('circuits') ||
    name.includes('sequence')
  ) {
    return 'Arps & Sequences';
  }

  // 9. Sound FX & Noise
  if (
    id.includes('fx') ||
    name.includes('fx') ||
    name.includes('wind') ||
    name.includes('laser') ||
    name.includes('noise') ||
    name.includes('shutter') ||
    name.includes('computer') ||
    name.includes('drone') ||
    name.includes('glitch') ||
    name.includes('hit')
  ) {
    return 'Sound FX';
  }

  // 10. FM Synthesizers (DX7)
  if (engine === 'dx7' || id.startsWith('dx7-') || name.startsWith('dx7')) {
    return 'FM Synthesizers';
  }

  return 'Synthesizers';
}

export function getAutoCategoryForMulti(multi: Multi): string {
  const id = multi.id.toLowerCase();
  const name = multi.name.toLowerCase();

  if (id.startsWith('multi-duran') || name.includes('duran')) {
    return 'Duran Duran';
  }

  return 'Multis & Layers';
}

/**
 * Returns a new array of patches with all patch.group values auto-assigned
 * if they are missing or if forceAll is true.
 */
export function autoCategorizePatches(patches: Patch[], forceAll: boolean = false): Patch[] {
  return patches.map(p => {
    if (forceAll || !p.group || !p.group.trim() || p.group === 'Uncategorized') {
      return {
        ...p,
        group: getAutoCategoryForPatch(p)
      };
    }
    return p;
  });
}

/**
 * Returns a new array of multis with all multi.group values auto-assigned
 * if they are missing or if forceAll is true.
 */
export function autoCategorizeMultis(multis: Multi[], forceAll: boolean = false): Multi[] {
  return multis.map(m => {
    if (forceAll || !m.group || !m.group.trim() || m.group === 'Uncategorized') {
      return {
        ...m,
        group: getAutoCategoryForMulti(m)
      };
    }
    return m;
  });
}
