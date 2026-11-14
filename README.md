# LexisFlow

**Voice-first, multilingual access to digital financial services, without touching the service's code.**

LexisFlow is a Chrome extension built for the SAFINUM Innovate Challenge. It sits on top of an existing banking page whose text is in French or English, shows that text in a Cameroonian national language (Ewondo, Fulfulde or Duala) as well as French and English, and reads any part of it aloud with the speech voice that the user's own browser and computer already provide. The extension itself is small (about half a megabyte): it ships no voice model.

## The problem

Many digital financial services in Cameroon are only available in French or English. People who find those languages hard can misread an amount, a fee, a beneficiary or a security warning, which is exactly where a mistake costs money. Rewriting every bank's application is not realistic.

## What it does

- **Translates the page in place.** Visible text is replaced from a curated phrase table. Choosing the site's own language puts the original text back exactly.
- **Never touches the money.** Amounts, fees, phone numbers, references, dates and names are locked before translation and checked after. If a translated sentence would change any of them, the translation is thrown away and the original is kept.
- **Reads aloud.** Hover (mouse) or tap (touch) any boxed block of text and it is read aloud in the browser's voice. *Read all* reads the page from the top. Money is spoken in words ("deux cent cinquante mille francs CFA").
- **Handles new content.** A message that appears after load is detected and announced; security alerts are read first.
- **Works without the service's help.** It is a content script and a widget in an isolated Shadow DOM. The page's code and structure are not changed.
- **Keeps everything on the device.** LexisFlow sends no page text, amount or input anywhere, and makes no network request. It speaks through the browser's built-in speech, which uses a voice installed on the computer when there is one. If a computer has only an online voice, the browser itself, not LexisFlow, may send the sentence being read to its provider (see the technical document, section 5).

## How it meets the five minimum functionalities

| # | Requirement | Status |
|---|---|---|
| 1 | Interface language adaptation | Done for the roughly 80 sentences of the test journey in French and English; Ewondo, Fulfulde and Duala are **unverified drafts** awaiting native-speaker review (see LANGUAGE-VALIDATION.md) |
| 2 | Support for a transaction journey | Balance, fees, transfer preparation, summary, receipt, errors and security warnings |
| 3 | Preservation of financial information | Values locked, checked and tested on every step in all five languages |
| 4 | Independent operation | No change to the page's source; translation edits visible text only |
| 5 | Adaptation to new content | New messages are **detected, announced and read aloud**, but text outside the known sentences is **not translated** (it stays in its own language with a notice). This is the main known limit |

## Install and run

You need a current Node.js (developed with Node 26) and Chrome.

```bash
cd lexisflow-extension
npm install
npm run build
```

Then in Chrome open `chrome://extensions`, switch on **Developer mode**, choose **Load unpacked**, and select the `lexisflow-extension/dist` folder. Open `https://safinum.cm/hackathon-test`; the LexisFlow pill appears at the bottom right. Reload the extension after every rebuild.

To rehearse without the live site: `npm run dev` serves a mock of the five-step journey with buttons that simulate content the jury might add.

`npm test` runs the automated tests; `npm run build` runs them first.

## Keyboard

| Key | Does |
|---|---|
| `Alt+L` | Open or close the panel (focus moves into it) |
| `Alt+R` | Hover/tap reading on or off |
| `Alt+P` | Read the whole page; again to pause or resume |
| `Alt+O` | Back to the page's original language |
| `Alt+Shift+L` / `Alt+Shift+S` | Next language / next speed (focus inside the bar) |
| `Esc` | Stop reading, then collapse the bar, then close LexisFlow |

Every control is a real button or select with a visible focus ring. Chrome may leave a shortcut unbound if another extension already uses it: check `chrome://extensions/shortcuts`.

## Where things are

The documents listed at the bottom of this table (`TECHNICAL.md`, `LANGUAGE-VALIDATION.md`, `VERIFICATION.md`, `SOURCES.md`, `DISCLOSURE-CARD.md`) are delivered with the SAFINUM submission and are not stored in this repository.

| Path | What |
|---|---|
| `lexisflow-extension/src/content/ | The page-facing work: translator, scanner, reader, hover/tap reader, widget mounting, shortcuts |
| `lexisflow-extension/src/shared/` | Value locking (`protect.ts`), translation (`translate.ts`), number words (`numbers.ts`), the phrase tables in `i18n/` |
| `lexisflow-extension/src/background/` | The service worker that passes keyboard shortcuts to the page |
| `lexisflow-extension/src/components/` | The widget (React) |
| `lexisflow-extension/tests/` | The automated tests |
| `TECHNICAL.md` | Architecture, integration approach, dependencies, known limitations, our own contribution |
| `LANGUAGE-VALIDATION.md` | Which languages are supported and how their accuracy is validated |
| `VERIFICATION.md` | What was tested (170 automated tests, hands-on checks) and what was not |
| `SOURCES.md`, `DISCLOSURE-CARD.md`, [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt) | Every tool and licence |

## Honest status

The extension has been exercised in a development harness with real key presses and a mock of the test journey, and the live test page was inspected. The automated tests pass. What has not yet been done, and the known limits of the prototype, are listed in the technical document (`TECHNICAL.md`), section 6.
