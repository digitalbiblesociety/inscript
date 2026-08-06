import excludeManifest from './biblebrain-exclude-ids.json';

export const bibleBrainExcludeIds = excludeManifest.bibleBrainExcludeIds ?? [];

// Associations discovered at runtime by BibleBrainTextProvider: catalog entries
// that duplicate a text we already serve contribute their audio here instead of
// a duplicate picker entry. Checked before the static manifest so fresh catalog
// data wins.
const runtimeAudioByCode = new Map();

// The ~240 kB association map loads on demand; lookups stay synchronous and
// return null until loadAudioAssociations() resolves.
let audioByCode = null;
let loadPromise = null;

/**
 * Registers catalog-derived audio associations, keyed by the inscript text they
 * belong to. Unlike the static manifest these aren't all same-code matches, so
 * only the target id is indexed.
 */
export function registerLinkedAudio(associations) {
  for (const assoc of associations ?? []) {
    if (assoc?.inscriptId) runtimeAudioByCode.set(assoc.inscriptId.toUpperCase(), assoc);
  }
}

export function loadAudioAssociations() {
  loadPromise ??= import('./biblebrain-audio-associations.json').then(manifest => {
    audioByCode = new Map();
    for (const assoc of manifest.default.audioAssociations ?? []) {
      // Same-code matches, so index by both (they're equal).
      if (assoc.inscriptId) audioByCode.set(assoc.inscriptId.toUpperCase(), assoc);
      if (assoc.bibleBrainId) audioByCode.set(assoc.bibleBrainId.toUpperCase(), assoc);
    }
  });
  return loadPromise;
}

/** Bible Brain audio association for a text bible (by id/abbr), or null. */
export function linkedAudioFor(textInfo) {
  if (!textInfo) return null;
  for (const code of [textInfo.id, textInfo.abbr]) {
    const key = String(code ?? '').toUpperCase();
    const assoc = runtimeAudioByCode.get(key) ?? audioByCode?.get(key);
    if (assoc) return assoc;
  }
  return null;
}

export const hasLinkedAudio = (textInfo) => linkedAudioFor(textInfo) != null;
