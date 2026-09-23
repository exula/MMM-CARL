# MMM-CARL

Compact household library loans for MagicMirror², using the CatalogPlus JSON endpoints at `catalogplus.libraryweb.org`. Each account has its own server-side cookie jar. Enter each account’s card and last name directly in the module’s MagicMirror `config.js` settings. No environment variables are required.

## Install and verify independently

Requires Node.js 20.19 or later and a compatible MagicMirror² installation. The module name and installation directory are **MMM-CARL**. Clone it with the destination name below (or copy the existing checkout into `MagicMirror/modules/MMM-CARL`):

```sh
cd ~/MagicMirror/modules
git clone https://github.com/exula/MMM-CARL.git MMM-CARL
cd MMM-CARL
```

Once the implementation is in that directory, install and test:

```sh
npm install
npm test
```

A `pnpm-lock.yaml` is also included; use `pnpm install --frozen-lockfile` for the exact dependency versions used during validation.

After adding the configuration below, check login and loan retrieval independently:

```sh
npm run check -- /path/to/MagicMirror/config/config.js
```

When installed under `MagicMirror/modules/MMM-CARL`, `npm run check` finds the standard MagicMirror config automatically. You can also pass a CommonJS file exporting just `{ accounts: [...] }`. The checker uses the first enabled `MMM-CARL` entry in a full MagicMirror config.

The executable `./scripts/check-account.js` logs in, retrieves all pages, then retrieves again to check session reuse. It prints account indices and loan counts only. Exit code is nonzero if any account fails. It does not print titles, credentials, response bodies, or cookies.

No real credentials are included. Automated tests use synthetic values and mocked responses. Login, loan retrieval and session reuse have been verified locally against the live service; the checker makes real login/loan requests but never renews or modifies loans.

## MagicMirror configuration

Add this entry to the `modules` array in your MagicMirror config, replacing the placeholders. Restart MagicMirror after changing account settings.

```js
{
  module: "MMM-CARL",
  position: "top_right",
  header: "Library loans",
  config: {
    accounts: [
      { name: "Home", card: "<library-card>", lastName: "<last-name>" },
      { name: "Second account", card: "<second-card>", lastName: "<last-name>" }
    ],
    pollSeconds: 3600,
    showAccount: true,
    groupByAccount: false,
    showAuthor: true,
    showFormat: true,
    maxItems: 10,
    soonDays: 7,
    warningDays: 3,
    timeZone: "America/New_York",
    locale: "en-US"
  }
}
```

Use one account entry or up to 20. Keep card numbers in quotes to preserve leading zeros. `name` is an optional display label; `card` and `lastName` are required strings.

Default polling is hourly. Set `pollSeconds` to change it (300–86400 seconds). Polls run after the previous poll finishes, with no overlap. All display instances share the first configured household and a single poller; use the same accounts and polling settings in each instance. Repeated subscriptions do not force extra logins.

## Display

- Default view sorts all household loans globally by due date, unknown dates last.
- `maxItems` limits the earliest items shown; `0` shows everything. A footer counts remaining items.
- `groupByAccount: true` groups the globally selected items by account. Groups are ordered by their earliest displayed due date; items within each group remain sorted. Grouping necessarily replaces strict global row order.
- `showAccount: false` hides account labels, including in error messages. `showAuthor` and `showFormat` toggle metadata.
- Dates and days remaining use the configured time zone and calendar days, handling daylight saving changes. The display refreshes every minute even between polls.
- CSS states: `catalogplus-normal`, `catalogplus-soon` (4–7 days), `catalogplus-warning` (1–3 days), `catalogplus-due-today`, and `catalogplus-overdue`. Thresholds are configurable; keep `warningDays <= soonDays`.
- Unknown epoch dates use `dueDateString` as display-only fallback, with no guessed countdown. Missing metadata is omitted.
- On account failures, the last successful loans remain visible with dashed borders and an account error showing the saved date. Other accounts continue updating. An empty result is distinguished from a failed or still-loading result.

## Appearance and UX options

All options go inside the module's `config`. Defaults preserve the compact, text-only display. Each display instance can choose its own appearance and filters.

| Option | Default | Behavior |
| --- | --- | --- |
| `width` | `"360px"` | Number of pixels or CSS length (`px`, `rem`, `em`, `%`, `vw`, `vh`); `auto` also works. |
| `maxHeight` | `"none"` | Optional height limit with manual vertical scrolling. No automatic scrolling. |
| `density` | `"compact"` | `compact`, `comfortable`, or `spacious`. |
| `rowGap` / `rowPadding` | `null` | Override density's row gap / vertical padding; numbers are pixels. |
| `fontScale` | `1` | Text scaling from 0.5 to 2, scoped to this module. |
| `layout` | `"list"` | `list` or `cards` (stacked rows with a background and rounded corners). |
| `titleLines` | `0` | Unlimited wrapping; a positive integer clamps the title to that many lines. Full title remains in the hover tooltip. |
| `colorMode` | `"color"` | `color` or `monochrome`; countdown text still communicates urgency. |
| `showStatusBorder` | `true` | Show the due-status border; stale rows use a dashed border when enabled. |
| `showCovers` | `false` | Load cover images using TLC UPC or ISBN endpoints. |
| `customerID` | `"009787"` | Customer ID for TLC covers; keep it quoted to preserve leading zeros. |
| `contentServerAddress` | `"https://ls2content.tlcdelivers.com"` | HTTPS content server base address or full `/tlccontent` endpoint. Used for both UPC and ISBN covers. |
| `coverCustomerId` | `null` | Legacy alias; when set, takes precedence over `customerID`. |
| `coverWidth` / `coverHeight` | `42` / `62` | Image dimensions in pixels (width 20–200, height 20–300). |
| `coverSize` | `"medium"` | TLC image request size: `small` (`BOOKJACKET-SM`) or `medium` (`BOOKJACKET-MD`). |
| `coverFit` | `"contain"` | `contain` shows the whole image; `cover` fills the box with cropping. |
| `coverPlaceholder` | `true` | Show a neutral icon for missing/failed images; otherwise omit their image slot. |
| `coverUrls` | `{}` | Optional HTTPS image URLs keyed by loan `itemId`, overriding automatic covers. |
| `showCallNumber` | `false` | Show the loan's call number, falling back to the catalog record. |
| `showPublicationDate` | `false` | Show the catalog publication date/year as supplied. |
| `showExtent` | `false` | Show the physical description (pages, discs, duration, etc.) when supplied. |
| `showSeries` | `false` | Show the main series when supplied. |
| `showCheckoutDate` | `false` | Show the checkout date, with a server-formatted string fallback. |
| `showLoanStatus` | `false` | Show any supplied loan status/message. Does not infer renewal eligibility. |
| `showBranch` | `false` | Include the transaction branch when available. |
| `showDueDate` / `showDaysRemaining` | `true` / `true` | Independently show the calendar date and countdown. |
| `dateFormat` | `{ month: "short", day: "numeric" }` | Standard `Intl.DateTimeFormat` options; `timeZone` comes from the module setting. |
| `countdownStyle` | `"short"` | `short` uses “3d left”; `long` uses “Due in 3 days”. |
| `showSummary` | `false` | Total checked-out and overdue counts for selected accounts, before due filtering or item limits. |
| `showLastUpdated` | `false` | Show the oldest successful update among selected accounts, including incomplete-account indication. |
| `showErrors` | `true` | Show account/service error messages. Stale borders and incomplete-data text remain when false. |
| `showMoreCount` | `true` | Display how many matching items were omitted by `maxItems`. |
| `hideWhenEmpty` | `false` | Hide the content when there are no matching loans and no account failures; the MagicMirror header may remain. |
| `emptyMessage` | `"No items checked out"` | Text for a successful empty result. Filtered-out items have a separate message. |
| `sortBy` | `"dueDate"` | `dueDate`, `title`, `author`, or `account`; non-date sorts use due date as the tie-breaker. |
| `filter` | `"all"` | `all`, `overdue`, or `dueSoon` (includes overdue, today, and up to `soonDays`). Unknown dates appear only in `all`. |
| `accountNames` | `[]` | Exact public account names to show; empty means all accounts. Does not change server polling. |

Existing controls include `showAccount`, `groupByAccount`, `showAuthor`, `showFormat`, `maxItems`, `soonDays`, `warningDays`, `locale`, `timeZone`, and `animationSpeed` (milliseconds). Filters apply before sorting and limiting. Account grouping is applied to the selected rows and overrides strict global ordering; groups follow their first item in the selected sort order.

A roomier cover-oriented display (merge into your existing config with `accounts`):

```js
showCovers: true,
width: "440px",
maxHeight: "600px",
density: "comfortable",
layout: "cards",
coverWidth: 52,
coverHeight: 76,
titleLines: 2,
showSummary: true,
showLastUpdated: true,
countdownStyle: "long"
```

A minimal due-soon display:

```js
width: "300px",
density: "compact",
fontScale: 0.9,
showAuthor: false,
showFormat: false,
showDueDate: false,
filter: "dueSoon",
maxItems: 5,
colorMode: "monochrome"
```

### Cover data

Live loan records expose cover identifiers in `resource.standardNumbers`, as `{ type: "Upc" | "Isbn", data: "..." }`. MMM-CARL preserves all unique UPCs and ISBNs in their supplied order, removes spaces/hyphens, and preserves leading zeros and ISBN-10 X check digits. Legacy `resource.upc`/`resource.isbn` and top-level equivalents are also accepted. Numeric identifiers are not guessed or zero-padded.

UPC and ISBN covers use the configured `contentServerAddress` (the `/tlccontent` path is appended if needed). Both send the configured `customerID` as `customerid`, `appid=ls2pac`, and `requesttype=BOOKJACKET-MD` by default (`BOOKJACKET-SM` with `coverSize: "small"`). Every identifier is sent as a repeated `upc` or `isbn` query parameter, matching the catalog's multi-ISBN requests. UPC is preferred if a record contains both types.

Image precedence is `coverUrls[itemId]`, then an optional `resource.coverUrl`, then the generated TLC request. Only HTTPS URLs are loaded. Images load lazily with no referrer, and errors switch to the placeholder. A provider-supplied “no cover” image is shown as returned. No library authentication cookie is attached by this module to cover requests. The live `imageDisplays` entries are format icons such as `Book.png`, not book jackets, and are not treated as cover URLs.

### Live-data field mapping

The module retains loan/item and catalog identifiers, title/author (with top-level fallbacks), format, transaction branch, due date and formatted fallback, UPCs/ISBNs, call number, publication date, physical extent, series, checkout date, status/message, and downloadable flag. Optional metadata stays hidden unless enabled; fields absent from the response are omitted. Checkout date and status/message were empty in the tested account, so their rendering is covered by synthetic tests.

The response also carries library-wide holdings, tags/reviews, generic hold-action flags and fee fields. These are not presented as the checked-out item's availability, renewal eligibility or a payable balance: their meaning/units have not been established. No loan-renewal or other account mutations are performed.

## Protocol and sessions

The client POSTs `/login?rememberMe=true` with `username`, `lastName`, `rememberMe: true`, and `password` equal to the last name, plus the supplied CatalogPlus headers. It then GETs `/loans/0/20/Status`. HTTP-only, Secure, domain/path-scoped, expiring and rotating cookies (including `TLC_PAT_KEY` and `JSESSIONID`) are managed by [tough-cookie](https://github.com/salesforce/tough-cookie). Cookie jars remain in memory and disappear on restart.

The first path number is treated as an **offset**: subsequent full pages request `/loans/20/20/Status`, `/loans/40/20/Status`, etc., until a short page. Offset pagination was verified live using two-item pages: offsets 0 and 2 returned two distinct loans each, matching the full four-loan result, and offset 4 returned an empty page. Larger accounts remain covered by simulated pagination tests. Repeated records or more than 100 full pages produce an explicit error rather than silently truncating data. No total-count field is assumed.

Valid JSON without a `Content-Type` header is accepted (observed on live login). 401/403, redirects, explicitly non-JSON responses and missing `loans` arrays trigger one fresh login and one complete retrieval retry. Redirects are never followed with credentials. The exact login JSON result is not assumed beyond an explicit `success: false`; usable cookies plus a loans response establish success. Network failures, timeouts and server errors wait for the next poll. Rate limiting also waits for the next poll. Every request has a 20-second timeout. A changed JSON schema may surface as an authentication or response error; endpoint behavior is unofficial and may change.

The browser sends the configured accounts to the helper for authentication. The helper returns only normalized loan fields, public account ID/name, last-update time and fixed error messages. Credentials and cookies are never logged or included in these replies. As with other MagicMirror module settings, account credentials are present in the browser configuration. Library loan data is visible to viewers of your MagicMirror, and all instances of this module display the same configured household accounts.

## Alternate with another module

MMM-CARL can alternate with one other module in the same MagicMirror region. For example, set both MMM-CARL and MMM-MealViewer to `position: "top_left"`, then add these settings to MMM-CARL's `config`:

```js
rotateWith: "MMM-MealViewer",
rotationInterval: 30000,
rotationAnimationSpeed: 400
```

Meals appears first; Library replaces it after 30 seconds, and the pair continues alternating. The wrappers are placed together at the partner's slot so other modules stay in order. The interval is in milliseconds (minimum 5000); the fade duration is also in milliseconds. Defaults are 30000 and 400. Set `rotateWith: null` (the default) to disable rotation.

Exactly one enabled partner with the matching module name must be in the same region. The timer continues while CARL is hidden; server polling continues as usual. Rotation uses its own MagicMirror visibility lock and does not force-show modules hidden by other controllers (such as brightness/remote-control actions). Configure rotation on only one side of the pair.

## Debug logging

Set `debug: true` inside the module's `config` and restart MagicMirror. Default is `false`. The standalone checker also respects this setting in the config it loads. To enable diagnostics for just one check, run `npm run check -- /path/to/config.js --debug`.

```js
config: {
  debug: true,
  accounts: [
    { name: "Home", card: "<library-card>", lastName: "<last-name>" }
  ]
}
```

Server diagnostics appear in the MagicMirror terminal or service logs. Display diagnostics appear in the browser developer console. All lines start with `[MMM-CARL]` and a timestamp. Server events include poll start/completion and next interval, account index and loan counts, login attempts, session reuse/renewal, page counts, HTTP status, request timing and sanitized error codes. Browser events include startup, received account/loan counts, failed and pending account counts, configuration errors, and failed cover images. In `browser.data`, `loans: 0` alone does not prove that the library returned an empty list: `failed > 0` means an account fetch failed, while `pending > 0` means an account has not completed its initial fetch.

No card numbers, login last names, account labels, titles, UPCs, image URLs, cookies, request/response bodies or raw exceptions are logged. Accounts are identified by their 1-based position in the configuration. Request response timing is time to response headers; failed-request timing includes time spent before failure. Cover failures are counted as events without identifying the item. Debug logs do not trigger additional requests. For multiple display instances, the first subscription sets server debugging along with the shared household configuration; use the same `debug` value in each instance.

## Files and validation

`scripts/check-account.js` and the module use the same `lib/client.js`. `node_helper.js` receives the account configuration and starts `lib/service.js`. `MMM-CARL.js`, `lib/display.js` and `MMM-CARL.css` render the browser display using text nodes.

All 28 automated tests pass. `npm test` covers authentication payloads, cookie rotation/reuse, account isolation, bounded session renewal, pagination, request coalescing, redacted errors, timeouts, partial failures, sorting, daylight saving boundaries, frontend rendering, the helper/browser boundary, UPC image URLs, broken-image fallbacks, filters and display options. Live login, loan retrieval and session reuse have been verified locally. Offset pagination was verified live with two-item pages, and cover endpoints returned image responses for all four current loans. The actual MagicMirror deployment still needs a deployment check.

Module lifecycle and socket conventions follow the [MagicMirror node-helper documentation](https://docs.magicmirror.builders/module-development/node-helper.html) and [core module documentation](https://docs.magicmirror.builders/module-development/core-module-file.html).


### Blank display after the clock loads

Earlier versions of MMM-CARL overwrote MagicMirror's reserved `this.data` module metadata. This is fixed by storing library results separately in `this.loanData`. Update the remote installation's `MMM-CARL.js` (or deploy the full updated module), restart the MagicMirror process, and reload any separate browser clients. This fix requires no account configuration changes.
