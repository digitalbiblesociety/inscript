/**
 * Imported once (`import './windows/index.js'`) purely for the side effect of
 * registering every window type with the registry. Nothing imports its members.
 *
 * Only TextWindow is static (a Bible window opens every startup); the rest use
 * `loadWindowClass` loaders so each window is its own lazy chunk. Metadata
 * stays eager so menus and URL parsing need no window code.
 */

import { registerWindowType } from '../core/registry.js';

import { getConfig } from '../core/config.js';

import { BibleWindow, CommentaryWindow } from './TextWindow.js';

const config = getConfig();
registerWindowType({
  param: 'bible',
  className: 'BibleWindow',
  WindowClass: BibleWindow,
  displayName: 'Bible',
  paramKeys: { textid: 't', fragmentid: 'v' }
});

registerWindowType({
  param: 'search',
  className: 'SearchWindow',
  loadWindowClass: () => import('./SearchWindow.js').then(m => m.SearchWindow),
  displayName: 'Search',
  paramKeys: { textid: 't', searchtext: 's', divisions: 'd' }
});

registerWindowType({
  param: 'audio',
  className: 'AudioWindow',
  loadWindowClass: () => import('./AudioWindow.js').then(m => m.AudioWindow),
  displayName: 'Audio',
  paramKeys: { textid: 't', fragmentid: 'v' }
});

registerWindowType({
  param: 'parallel',
  className: 'ParallelsWindow',
  loadWindowClass: () => import('./ParallelsWindow.js').then(m => m.ParallelsWindow),
  displayName: 'Parallels',
  paramKeys: { textid: 't', parallelid: 'p' }
});

registerWindowType({
  param: 'comparison',
  className: 'TextComparisonWindow',
  loadWindowClass: () => import('./TextComparisonWindow.js').then(m => m.TextComparisonWindow),
  displayName: 'Comparison',
  paramKeys: { sourceId: 't', targetId: 'u', fragmentid: 'f' },
  init: {
    sourceId: config.newComparisonWindowSourceVersion,
    targetId: config.newComparisonWindowTargetVersion,
    fragmentid: 'John 3:16'
  }
});

registerWindowType({
  param: 'stats',
  className: 'StatisticsWindow',
  loadWindowClass: () => import('./StatisticsWindow.js').then(m => m.StatisticsWindow),
  displayName: 'Statistics',
  paramKeys: {}
});

registerWindowType({
  param: 'deafbible',
  className: 'DeafBibleWindow',
  loadWindowClass: () => import('./DeafBibleWindow.js').then(m => m.DeafBibleWindow),
  displayName: 'Deaf Bible',
  paramKeys: { textid: 't', fragmentid: 'v' }
});

registerWindowType({
  param: 'media',
  className: 'MediaWindow',
  loadWindowClass: () => import('./MediaWindow.js').then(m => m.MediaWindow),
  displayName: 'Media',
  paramKeys: { videoLanguage: 'vl' }
});

registerWindowType({
  param: 'map',
  className: 'MapWindow',
  loadWindowClass: () => import('./MapWindow/MapWindow.js').then(m => m.MapWindow),
  displayName: 'Map',
  paramKeys: { latitude: 'lat', longitude: 'lon', journey: 'j' }
});

registerWindowType({
  param: 'commentary',
  className: 'CommentaryWindow',
  WindowClass: CommentaryWindow,
  displayName: 'Commentary',
  paramKeys: { textid: 't', fragmentid: 'v' }
});

registerWindowType({
  param: 'notes',
  className: 'NotesWindow',
  loadWindowClass: () => import('./NotesWindow.js').then(m => m.NotesWindow),
  displayName: 'Notes',
  paramKeys: { noteId: 'n', filter: 'f', sort: 'o' }
});
