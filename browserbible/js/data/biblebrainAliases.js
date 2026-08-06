/**
 * Bible Brain ids that must never appear as their own text, each mapped to the
 * inscript text id that supersedes it. Hand-maintained: these are the cases the
 * exact-code dedup in BibleBrainTextProvider can't see, because Bible Brain uses
 * a different code for the same work (ENGESV vs our ESV) or ships several
 * recordings of one translation under separate codes.
 *
 * The Bible Brain entry is always dropped from the picker. Any audio it carries
 * is paired to the target text, merged with every other source for that target,
 * and becomes available whenever that text is present (local, API.Bible, or ESV
 * API); the association is simply unused when it isn't.
 */
const bibleBrainTextAliases = {
  // English Standard Version, served via the ESV API (esv:ESV). Three Bible
  // Brain codes carry three different recordings of the same text.
  ENGESV: 'ESV',    // NT+OT, plain + dramatized
  EN1ESV: 'ESV',    // "Hear the Word" recording
  ENGGID: 'ESV',    // Gideons recording

  // New Living Translation, served via API.Bible (apibible:NLT).
  ENGNLT: 'NLT',    // "Holy Sanctuary" recording
  ENGNLH: 'NLT',    // her.BIBLE (women's voices)

  // Christian Standard Bible, served via API.Bible (apibible:CSB). Bible Brain
  // has no CSB text, only this audio.
  ENGCSB: 'CSB',

  // World English Bible: we ship ENGWEB, and this is a second dramatized
  // reading of it, so its audio joins ENGWEB's own Bible Brain recording.
  ENGWWH: 'ENGWEB',

  // New American Standard Bible: we ship ENGNASB. Text only, nothing to pair.
  ENGNAS: 'ENGNASB',

  // In source but deliberately not shipped (exclude_inscript = true), so the
  // Bible Brain copy shouldn't reintroduce them. Audio would pair if we ever
  // ship the text.
  ENGBER: 'ENGBSB', // Berean Standard
  ENGWMV: 'ENGWYC', // Wycliffe, modern spelling
  ENGREV: 'ENGREV'  // Revised Version 1885
};

/** The inscript text that supersedes a Bible Brain id, or null. */
export const aliasTargetFor = (abbr) =>
  bibleBrainTextAliases[String(abbr ?? '').toUpperCase()] ?? null;

/**
 * Bible Brain ids that share a code with one of our texts but are NOT the same
 * work, so the same-code assumption has to be switched off for them. Left
 * paired, each one plays audio that doesn't match the words on screen, or
 * advertises audio that can never play. Blocked entries fall through to normal
 * handling, so the ones carrying readable text return to the picker as the
 * separate works they are.
 *
 * Each entry is a verified defect from the 2026-08-05 pairing audit. Keep the
 * evidence with the code: a bare list rots into folklore.
 */
const bibleBrainPairingBlocklist = {
  // Wrong translation: audio does not match our text.
  MAMSBG: 'our MAMSBG is the Todos Santos Mam NT (Wycliffe 2000); this entry is '
    + 'Northern Mam (Bible Society of Guatemala 1993). source/MAMSBG/description.md '
    + 'already points at Bible Brain MVJWBT for this text audio.',
  MALNIB: 'our MALNIB is the Indian Revised Version Malayalam (Bridge Connectivity, '
    + '66 books); this entry is the Bible League NT, filesets MJSWTC*.',
  HEBM95: 'our HEBM95 is the Westminster Leningrad OT plus a public-domain Delitzsch '
    + 'NT (iso hbo); this entry is FCBH 1995 Modern Hebrew (iso heb), filesets HBRHMT*.',

  // No overlap: every fileset fails filesetCoversTestament, so the audio UI
  // appears but no chapter can ever play.
  AVAIBT: 'our text is 27 NT books; the only audio here is OTP (Ruth, Esther, Jonah).',
  RMYPBT: 'our text is Genesis, Jonah and Ruth; the only audio here is NTP (Luke, '
    + 'Acts). Returns to the picker: that Luke and Acts is text we do not serve.',
  MEYPBT: 'our text is Genesis only; the only audio here is NT.'
};

/** True when the same-code pairing must not be applied to this Bible Brain id. */
export const isPairingBlocked = (abbr) =>
  Object.hasOwn(bibleBrainPairingBlocklist, String(abbr ?? '').toUpperCase());
