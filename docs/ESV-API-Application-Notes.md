# ESV API Application Notes

Draft answers for the Crossway ESV API access application for inScript
(inscript.org), the Digital Bible Society's browser-based Bible study app.

## Description of ESV Copyright Compliance

- The ESV text is retrieved live from the ESV API (`api.esv.org/v3/passage/html/`),
  one chapter per request. No copy of the ESV is stored on our servers or
  bundled with the app; the only caching is transient, in-memory, per browser
  session, and is discarded when the page closes.
- The API key is held exclusively in a server-side proxy (a Cloudflare Worker at
  `api.inscript.org`). It is never embedded in the client application or exposed
  to end users.
- The text is displayed unmodified and unabridged: wording, verse numbers,
  section headings, psalm superscriptions, poetry line formatting, and
  words-of-Christ styling are all preserved as delivered by the API. Optional
  elements (footnotes, cross-references, audio links) are omitted only through
  the API's own include parameters.
- Attribution: the full copyright notice is shown in the version's About panel,
  displayed verbatim as "The Holy Bible, English Standard Version® (ESV®),
  copyright © 2001 by Crossway, a publishing ministry of Good News Publishers.
  Used by permission. All rights reserved. ESV Text Edition: 2016." along with a
  credit and link to the ESV API. The "ESV" name is shown in the version chooser
  and in the header of every window displaying the text.
- The app provides no bulk download, export, or offline copy of the ESV. User
  copying is limited to the passage on screen, well within the ESV quotation
  limits (500 verses, less than a complete book).
- API rate limits are respected: requests are made only on user navigation,
  duplicate in-flight requests are coalesced, and HTTP 429 responses are handled
  gracefully with a user-facing message rather than retries.

## Built-in Costs

- None. inScript is completely free to use: no purchase price, no subscription,
  no in-app purchases, no advertising, and no registration or login required.
- The app is operated by the Digital Bible Society, a nonprofit ministry, and
  the underlying BrowserBible codebase is open source (MIT license,
  github.com/digitalbiblesociety/browserbible-3).

## Bible Versions Included in Product

- More than 1,300 Bible texts in over 1,100 languages, served from the Digital
  Bible Society's library (bible.cloud).
- English versions include: World English Bible (WEB), American Standard
  Version (ASV), King James Version (KJV), NET Bible, NASB, Legacy Standard
  Bible (LSB), Modern English Version (MEV), Literal Standard Version (LSV),
  Easy-to-Read Version (ERV), Bible in Basic English (BBE), Darby, Young's
  Literal Translation (YLT), Wycliffe, Tree of Life Version (TLV), Brenton
  Septuagint, and others.
- NIV, CSB, and NLT are provided through API.Bible under the same
  server-side-key proxy pattern proposed for the ESV.
- Additional translations, plus audio Bibles, are available through Bible Brain
  (Faith Comes By Hearing), and the app also offers sign-language Deaf Bible
  video, public-domain commentaries, and original-language study texts.

## Additional information/statistics

- Product: inScript (inscript.org), a free browser-based Bible study
  application; no installation required, works on desktop and mobile browsers.
- Publisher: Digital Bible Society (dbs.org).
- Study features: multiple parallel windows for side-by-side version
  comparison, verse-synchronized scrolling, full-text search, Greek/Hebrew
  morphology and lemma tools, audio and video integration, maps, and
  commentaries.
- Expected ESV usage: text is requested one chapter at a time as users read,
  with per-session caching preventing repeat requests for the same chapter.
  Search is capped at 2,000 results per query. Expected volume is well within
  the ESV API's standard daily query limits.
- Usage statistics: [fill in current monthly visitors / page views]
- Contact: [name, email]
