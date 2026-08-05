/** Fileset selection and timestamp parsing for Bible Brain audio. */

import { NT_BOOKS } from '../bible/BibleData.js';

const PLAIN_TYPE = 'audio';
const DRAMA_TYPE = 'audio_drama';

export const isBibleBrainAudioEnabled = (config) =>
  config.enableOnlineSources && config.bibleBrainEnabled && !!config.bibleBrainProxyBase;

const isNtBook = (bookCode) => NT_BOOKS.includes(bookCode);

export function filesetCoversTestament(size, isNT) {
  const s = String(size ?? '').toUpperCase();
  if (s === '' || s === 'C' || s === 'P' || s === 'S') return true;
  return isNT ? s.includes('NT') : s.includes('OT');
}

export function selectAudioFileset(audioFilesets, bookCode, audioOption) {
  if (!Array.isArray(audioFilesets) || audioFilesets.length === 0) return null;

  const isNT = isNtBook(bookCode);
  const covering = audioFilesets.filter(fs => filesetCoversTestament(fs.size, isNT));

  if (covering.length === 0) return null;

  const drama = covering.filter(fs => fs.type === DRAMA_TYPE);
  const plain = covering.filter(fs => fs.type === PLAIN_TYPE);

  const preferDrama = audioOption === 'drama';
  const primary = preferDrama ? drama : plain;
  const secondary = preferDrama ? plain : drama;

  const base = (list) => list.find(fs => fs.id && !fs.id.includes('-')) || list[0];
  return base(primary) || base(secondary) || covering[0] || null;
}

export function parseTimestamps(data) {
  if (!Array.isArray(data)) return null;
  const timestamps = data
    .map(t => ({ verse: Number(t.verse_start), time: Number(t.timestamp) }))
    .filter(t => Number.isFinite(t.verse) && Number.isFinite(t.time))
    .sort((a, b) => a.time - b.time);
  return timestamps.length > 0 ? timestamps : null;
}

export function biblebrainAudioInfo(textInfo, audioFilesets) {
  if (!Array.isArray(audioFilesets) || audioFilesets.length === 0) return null;

  return {
    type: 'biblebrain',
    title: textInfo.name,
    audioFilesets,
    hasPlainAudio: audioFilesets.some(fs => fs.type === PLAIN_TYPE),
    hasDramaAudio: audioFilesets.some(fs => fs.type === DRAMA_TYPE)
  };
}
