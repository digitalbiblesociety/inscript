import excludeManifest from './biblebrain-exclude-ids.json';

export const bibleBrainExcludeIds = excludeManifest.bibleBrainExcludeIds ?? [];

// The ~240 kB association map loads on demand; lookups stay synchronous and
// return null until loadAudioAssociations() resolves.
let audioByCode = null;
let loadPromise = null;

export function loadAudioAssociations() {
  loadPromise ??= import('./biblebrain-audio-associations.json').then(manifest => {
    // Index by both inscript id and BB id (equal for exact matches).
    audioByCode = new Map();
    for (const assoc of manifest.default.audioAssociations ?? []) {
      if (assoc.inscriptId) audioByCode.set(assoc.inscriptId.toUpperCase(), assoc);
      if (assoc.bibleBrainId) audioByCode.set(assoc.bibleBrainId.toUpperCase(), assoc);
    }
  });
  return loadPromise;
}

/** Bible Brain audio association for a text bible (by id/abbr), or null. */
export function linkedAudioFor(textInfo) {
  if (!audioByCode || !textInfo) return null;
  return audioByCode.get(String(textInfo.id ?? '').toUpperCase())
    ?? audioByCode.get(String(textInfo.abbr ?? '').toUpperCase())
    ?? null;
}

export const hasLinkedAudio = (textInfo) => linkedAudioFor(textInfo) != null;
