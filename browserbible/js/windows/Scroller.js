import { elem } from '../lib/helpers.esm.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { getConfig } from '../core/config.js';
import { insertContent, showChapterUnavailable, showLoadError } from './ScrollerContent.js';
import { load, loadMore } from './ScrollerLoading.js';
import { scrollTo, setScrollTop, TEXT_TYPES, updateLocationInfo } from './ScrollerLocation.js';

const SPEED_CHECK_INTERVAL = 100;

class ScrollerController {
  constructor(node) {
    this.nodeElement = node?.nodeType ? node : node?.[0];
    this.wrapper = this.nodeElement.querySelector('.scroller-text-wrapper');
    this.currentTextInfo = null;
    this.locationInfo = {};
    this.suppressedScrollTop = null;
    this.loadEpoch = 0;
    this.pendingLoadSectionid = null;
    this.pendingLoadFragmentid = null;
    this.inflightDirectional = { next: null, prev: null };
    this.speedLastPos = null;
    this.speedDelta = 0;
    this.globalTimeout = null;
    this.speedInterval = null;
    this.speedIndicator = elem('div', {
      className: 'scroller-speed',
      style: {
        zIndex: 50, position: 'absolute', top: 0, left: 0, width: '50px',
        background: 'black', padding: '5px', color: '#fff', display: 'none'
      }
    });
    this.nodeElement.parentNode?.appendChild(this.speedIndicator);
    mixinEventEmitter(this);
    this._events = {};
    this.handleScroll = () => this.onScroll();
    this.nodeElement.addEventListener('scroll', this.handleScroll);
  }

  startGlobalTimeout() {
    if (this.globalTimeout == null) {
      this.globalTimeout = requestAnimationFrame(() => this.triggerGlobalEvent());
    }
  }

  triggerGlobalEvent() {
    if (this.currentTextInfo) {
      this.trigger('globalmessage', {
        type: 'globalmessage', target: this,
        data: {
          messagetype: 'nav',
          type: this.currentTextInfo.type?.toLowerCase() ?? TEXT_TYPES.BIBLE,
          locationInfo: this.locationInfo
        }
      });
    }
    cancelAnimationFrame(this.globalTimeout);
    this.globalTimeout = null;
  }

  onScroll() {
    const programmatic = this.suppressedScrollTop !== null
      && Math.abs(this.nodeElement.scrollTop - this.suppressedScrollTop) <= 1;
    this.suppressedScrollTop = null;
    this.updateLocationInfo();
    this.trigger('scroll', {
      type: 'scroll', target: this, data: { locationInfo: this.locationInfo }
    });
    if (!programmatic) this.startGlobalTimeout();
    this.startSpeedTest();
  }

  startSpeedTest() {
    if (this.speedInterval == null) {
      this.speedInterval = setInterval(() => this.checkSpeed(), SPEED_CHECK_INTERVAL);
    }
  }

  stopSpeedTest() {
    if (this.speedInterval != null) clearInterval(this.speedInterval);
    this.speedInterval = null;
  }

  checkSpeed() {
    const position = this.nodeElement.scrollTop;
    if (this.speedLastPos != null) this.speedDelta = position - this.speedLastPos;
    this.speedLastPos = position;
    if (this.speedDelta === 0) {
      this.loadMore();
      this.stopSpeedTest();
    }
  }

  updateLocationInfo() {
    updateLocationInfo(this);
  }

  setScrollTop(top) {
    setScrollTop(this, top);
  }

  loadMore() {
    loadMore(this);
  }

  insertContent(loadType, content) {
    insertContent(this, loadType, content);
  }

  showChapterUnavailable(sectionid) {
    showChapterUnavailable(this, sectionid);
  }

  showLoadError(message) {
    showLoadError(this, message);
  }

  load(loadType, sectionid, fragmentid) {
    load(this, loadType, sectionid, fragmentid);
  }

  scrollTo(fragmentid, scrollOffset) {
    scrollTo(this, fragmentid, scrollOffset);
  }

  size(width, height) {
    this.nodeElement.style.width = `${width}px`;
    this.nodeElement.style.height = `${height}px`;
  }

  getTextInfo() {
    return this.currentTextInfo;
  }

  setTextInfo(textInfo) {
    const config = getConfig();
    if (textInfo?.stylesheet !== undefined) {
      const styleId = `style-${textInfo.id}`;
      if (!document.getElementById(styleId)) {
        document.head.appendChild(elem('link', {
          id: styleId, rel: 'stylesheet',
          href: `${config.baseContentUrl}${config.textsPath}/${textInfo.id}/${textInfo.stylesheet}`
        }));
      }
    }
    this.currentTextInfo = textInfo;
    this.loadEpoch++;
    this.pendingLoadSectionid = null;
    this.pendingLoadFragmentid = null;
  }

  getLocationInfo() {
    return this.locationInfo;
  }

  close() {
    this.nodeElement.removeEventListener('scroll', this.handleScroll);
    this.stopSpeedTest();
    if (this.globalTimeout != null) cancelAnimationFrame(this.globalTimeout);
    this.globalTimeout = null;
    this.speedIndicator.remove();
    this.clearListeners();
  }

  broadcastCurrentContent() {
    if (!this.wrapper || !this.currentTextInfo || !this.locationInfo?.sectionid) return;
    const section = this.wrapper.querySelector(
      `.section[data-id="${this.locationInfo.sectionid}"]`);
    const content = section ? section.outerHTML : this.wrapper.innerHTML;
    if (!content?.trim()) return;
    const type = this.currentTextInfo.type?.toLowerCase() ?? TEXT_TYPES.BIBLE;
    this.trigger('globalmessage', {
      type: 'globalmessage', target: this,
      data: {
        messagetype: 'textload', texttype: type, type,
        textid: this.currentTextInfo.id, abbr: this.currentTextInfo.abbr,
        sectionid: this.locationInfo.sectionid,
        fragmentid: this.locationInfo.fragmentid,
        content
      }
    });
  }
}

export function Scroller(node) {
  return new ScrollerController(node);
}
