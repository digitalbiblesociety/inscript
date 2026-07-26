/**
 * BaseAudioProvider
 * Base class for audio providers. All methods are async and return values (or null).
 * Subclasses must override methods they support.
 */
export class BaseAudioProvider {
  get name() { return 'base'; }

  /** Resolves to an audioInfo object, or null when this provider has none. */
  async getAudioInfo(textInfo) { return null; }

  /**
   * `audioInfo` comes from getAudioInfo(), `fragmentid` looks like "GN1_1", and
   * `audioOption` is "drama" or "audio". Resolves to
   * { url, id, start, end, timestamps? } or null.
   */
  async getFragmentAudio(textInfo, audioInfo, fragmentid, audioOption) { return null; }

  async getNextFragment(textInfo, audioInfo, fragmentid) { return null; }

  async getPrevFragment(textInfo, audioInfo, fragmentid) { return null; }
}
