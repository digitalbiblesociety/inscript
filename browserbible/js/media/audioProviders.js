/** Registers every audio provider, in priority order. */

import { registerAudioSource } from '../core/registry.js';
import { LocalAudioProvider } from './LocalAudioProvider.js';
import { DbsAudioProvider } from './DbsAudioProvider.js';
import { BibleBrainAudioProvider, LinkedBibleBrainAudioProvider } from './BibleBrainAudioProvider.js';

registerAudioSource(new LocalAudioProvider());
registerAudioSource(new BibleBrainAudioProvider());
registerAudioSource(new DbsAudioProvider());
registerAudioSource(new LinkedBibleBrainAudioProvider());
