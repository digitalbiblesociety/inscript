import { initVerseDetection, type InitializedVerseDetection } from './VerseDetectionPlugin.js';

/** Reads the data-* attributes documented in README.md off this script's own tag. */
function getConfig(): {
	appUrl: string;
	mode: 'popup' | 'link' | 'both';
	selector: string;
	newTab: boolean;
	language: string | null;
	showLogo: boolean;
} {
	// Last match wins, so a page embedding several copies uses the newest tag.
	const scripts = document.querySelectorAll('script[src*="verse-detection"]');
	const scriptTag = scripts[scripts.length - 1] as HTMLScriptElement | null;

	return {
		appUrl: scriptTag?.dataset.appUrl ?? 'https://inscript.org',
		mode: (scriptTag?.dataset.mode as 'popup' | 'link' | 'both') || 'both',
		selector: scriptTag?.dataset.selector ?? 'body',
		newTab: scriptTag?.dataset.newTab !== 'false',
		language: scriptTag?.dataset.language ?? null,
		showLogo: scriptTag?.dataset.showLogo !== 'false'
	};
}

async function autoInit(): Promise<void> {
	const config = getConfig();

	try {
		const verseSystem: InitializedVerseDetection = await initVerseDetection(null, {
			appBaseUrl: config.appUrl,
			displayMode: config.mode,

			contentSource: {
				type: 'remote',
				baseUrl: `https://inscript.bible.cloud/content/${new URLSearchParams(window.location.search).get('dev') === 'true' ? 'texts_dev' : 'texts'}`,
				textsIndexUrl: `https://inscript.bible.cloud/content/${new URLSearchParams(window.location.search).get('dev') === 'true' ? 'texts_dev' : 'texts'}/texts.json`,
				dynamicTextSelection: true,
				autoSelectByLanguage: true,
				preferredTextIdsByLanguage: {
					'en': 'ENGWEB',
					'es': 'SPNRVG',
					'pt': 'PORBLS',
					'fr': 'FRALSG',
					'de': 'GERLUT',
					'ru': 'RUSSYN'
				}
			},

			language: {
				autoDetect: !config.language,
				primary: config.language ?? undefined,
				additional: 'all'
			},

			link: {
				openInNewTab: config.newTab,
				useHashNavigation: true
			},

			versionLinking: {
				includeVersion: true,
				versionParam: 'version'
			},

			popup: {
				showLogo: config.showLogo,
				logoUrl: config.appUrl
			},

			appIntegration: {
				useAppTextLoader: false,
				useAppNavigation: false,
				registerAsPlugin: false,
				syncLanguage: false
			}
		});

		const containers = document.querySelectorAll<HTMLElement>(config.selector);
		containers.forEach(container => {
			verseSystem.processContainer(container);
		});

		// Documented escape hatch for pages that need to reconfigure at runtime.
		(window as any).verseDetection = verseSystem;

		console.log('[Verse Detection] Initialized successfully');
		console.log('[Verse Detection] Processed', containers.length, 'container(s)');

	} catch (error) {
		console.error('[Verse Detection] Initialization failed:', error);
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', autoInit);
} else {
	autoInit();
}
