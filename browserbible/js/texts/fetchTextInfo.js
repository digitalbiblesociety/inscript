import { getConfig } from '../core/config.js';

/** `contentPath` is a segment such as 'content/texts' or 'content/commentaries'. */
export function fetchTextInfo(cache, contentPath, textid, callback, errorCallback) {
  if (cache[textid] !== undefined) {
    callback(cache[textid]);
    return;
  }

  const config = getConfig();
  const infoUrl = `${config.baseContentUrl}${contentPath}/${textid}/info.json`;

  fetch(infoUrl)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      cache[textid] = data;
      callback(data);
    })
    .catch(error => {
      console.error(`ERROR fetchTextInfo: ${infoUrl}`);
      errorCallback?.(error);
    });
}
