# **Lighter: Initiative Scope**

## *Engineering scope · Perps team · Q4 2026*

| Document owner (EM) | Alejandro Garcia |
| :---- | :---- |
| **DRIs** | PM: Matthieu Saint Olive · Design: Nikki Pham, Raphaella · Tech lead: Arthur Breton |
| **Status** | Draft |
| **Last updated** | Oct 28, 2026 |
| **Target RC** | Mobile v\[TBD\]. Launch to VIP closed beta before the VIP program rollout in mid-January 2027 |
| **Links** | [Product review deck](https://docs.google.com/presentation/d/1k5A6pANdNumzb-h1pYAHQx3KJLL-pZMmzgAomfQV-pI/edit) · [Figma designs](https://www.figma.com/design/RKxgK44BoVRyKtmjjP4SFc/PERPS---13-Jul---xx-Nov?node-id=15205-233711&m=dev) · [V1 must-haves (Slack)](https://consensys.slack.com/archives/D06FURKQVRD/p1792660465426369) · [\#mm-trade-perps-lighter-dd](https://consensys.slack.com/archives/C0BCTAE88NT) |

Scope covers the Perps engineering work for Lighter on MetaMask Mobile (lite and pro mode) plus the backend market index. The web terminal and Social are tracked as dependencies. Items marked \[TBD\] still need an owner or a date.

# **Reviewers**

| Name | Role | Sign-off date and comment |
| :---- | :---- | :---- |
| Matthieu Saint Olive | PM |  |
| Nikki Pham | Design |  |
| Arthur Breton | Tech lead |  |
| \[Name\] | Confirmations |  |
| \[Name\] | Perps backend |  |
| \[Name\] | Security |  |

# **Summary**

We believe that by adding Lighter as a second venue in MetaMask Perps, we can offer high-volume traders an all-in fee that meets the CEX bar and grow traders above \$1M per month from about 70 to over 100 by end of Q1 2027\.

V1 ships behind a feature flag: internal dogfood on mainnet, then a closed beta for VIPs and hand-picked traders, then retail. Hyperliquid stays the default venue, and users can switch venue on each trade.

# **User problems**

## **Primary target users**

* MetaMask VIPs trading over \$50M per month (primary)
* High Value Users trading over \$1M per month, about 70% of perps revenue (secondary)

## **Problems we solve**

* At \$10M per month, a MetaMask trader pays 14 bps taker / 11.2 bps maker all-in, against about 4 / 1.5 bps on CEXs and other DEXs.
* On Hyperliquid we cannot reach the CEX bar at any MetaMask fee, including zero, because the venue fee alone is 4.5 / 1.5 bps.
* Perps revenue depends fully on Hyperliquid, which confirmed on Aug 21 that it is building its own mobile app.

# **Insights**

* Trading fees are the most consistent VIP objection (Hong Kong, NYC, Korea, Singapore), even at VIP pilot fees.
* A VIP Diamond trader moved about \$200M per month to Perpl for a 6-month no-fee offer.
* MetaMask was the \#1 Hyperliquid builder by revenue in September but \#7 by whale count (81 vs Phantom's 213). About 40% of revenue came from one user in Aug and Sep.
* Lighter is the \#3 perp DEX by 30-day volume and is integrated by Robinhood and Telegram. It had 8.0K MetaMask Extension users in Q3.
* User research (4 users, Sep 23): multi-venue trading is valued, a trusted default reduces decision anxiety, and experienced users want comparison data rather than a toggle.

# **Goals**

## **Business goals**

* Grow traders above \$1M per month from about 70 to over 100 by end of Q1 2027 (OKR).
* Acquire about 20 VIPs trading \$50M per month and about 20 more HVUs by end of Q1 2027\.
* Be live for VIPs before the VIP program grows from 5 to about 25 participants in mid-January.

## **Product goals**

* Lighter as a second venue in Mobile perps, with a default venue setting and per-trade switching in lite and pro mode.
* Trading parity with Hyperliquid across the full order lifecycle, with no Lighter-only feature gaps.
* Venue-scoped balances, positions and orders that never imply a shared balance.
* Same MetaMask builder fee and VIP fee ladder on both venues, with the correct final fee shown everywhere.

## **Success metrics**

| Metric | Baseline | Target | Source |
| :---- | :---- | :---- | :---- |
| Traders above \$1M per month | 81 (Sep 2026\) | 213 (Phantom parity) by Jun 2027 | Builder data / MetaMetrics |
| Share of VIP volume on Lighter | 0% | Over 70% | MetaMetrics |
| Order success rate, Lighter and Hyperliquid | \[HL baseline\] | No regression | MetaMetrics / Sentry |
| Realised slippage vs estimate on majors | n/a | Within 20% | All-in cost log |
| Perps screen viewed to trade conversion | \[Baseline\] | No regression (guardrail) | MetaMetrics |

# **Scope**

Feature scope below is what blocks the RC. Visual changes from UAT and bugs from testing are tracked separately.

## **Must have (blocks the RC)**

| Feature | Description | Platform | UAT criteria | Jira |
| :---- | :---- | :---- | :---- | :---- |
| Welcome page | Dismissible welcome page shown from any perps entry point once Lighter is enabled, with a Rive animation (depends on the animation asset). | Mobile | Shows from every entry point until dismissed; dismissal persists; animation never blocks the page. |  |
| Settings page | Trading mode (lite or pro) and default provider dropdown. Replaces the Lite/Pro switcher as the entry point from market detail pages. | Mobile | Default provider persists and drives market data and trade defaults. |  |
| Perps home balance | Balance aggregated across providers, with a bottom sheet to deposit to or withdraw from each provider. | Mobile | Total equals the sum of provider balances; breakdown per provider is visible. |  |
| Activity | Activity list shows the provider logo on each row. | Mobile | Every row is attributed to the correct provider. |  |
| Deposit and withdraw | Provider selection, including Money account. Option to move funds from one provider to the other. | Mobile | Deposit and withdraw work on both providers with any token; transfers between providers complete. |  |
| Markets list | One row per market. Provider logo only when the market exists on one provider. Provider filter, where at least one provider must stay selected. Market data comes from the default provider. | Mobile | A market listed on both providers shows one row; deselecting the last provider is blocked. |  |
| Lite market detail | Trade on {provider} selector, defaulting to settings and changeable at trade time. Provider logo on the market icon. Settings entry point replaces the Lite/Pro switcher. Long/short sheet uses the selected provider. Leverage sheet prompts a provider change for higher leverage. Alert when the user holds a position on the other provider, linking to that market page. Pay with USDC on either provider, with an add-funds prompt when none is available. | Mobile | Order goes to the provider shown in the selector; alert and leverage prompt link to the right provider. |  |
| Pro market detail | Same as lite, plus a Compare providers sheet: fee, slippage, funding rate, liquidation price, max leverage, open interest and 24h volume, with editable size. Selecting a provider keeps the size. Account sheet shows the aggregated balance with the same deposit and withdraw sheet as perps home. Positions and orders show for all providers. | Mobile | Comparison values match each venue; selected provider and size persist; positions and orders are attributed per provider. |  |
| Backend market index | Backend indexes and caches Lighter markets: category, name, description and other metadata. Handles the market mapping logic for the client and keeps the same market structure as today. Reports missing metadata on new markets to Slack. | Backend | Every Lighter market has a category and metadata; new markets with missing metadata trigger a Slack alert. |  |
| Fees and instrumentation | Same builder fee and VIP fee ladder on both venues; no 300 ms speed bump for VIPs. Venue, tier and trade\_origin on every Segment event. All-in cost estimate (fee plus slippage) logged for both venues on every order. | Mobile / Backend | Fee shown matches fee charged on Lighter orders; events carry the venue. |  |
| Graceful degradation | If Lighter degrades or is unavailable, show an outage banner and never drop orders silently. | Mobile | Banner shows when Lighter is down; failed orders surface an error. |  |
| Notifications parity | Lighter positions and orders trigger the same notifications as Hyperliquid, with the provider shown in each notification. Depends on the Growth team. | Mobile / Backend | Every notification available for Hyperliquid also fires for Lighter and names the right provider. |  |
| Lighter RFQ | Request for quote on Lighter for large orders: market makers replenish the order book, then the trade executes like a market order. RFQ option in the order type selector, plus an RFQ CTA next to Place order when the user is about to place a large market order. | Mobile (pro mode) | RFQ is offered in the order selector and on large Lighter market orders; the order executes on Lighter after the RFQ. | [TAT-4323](https://consensyssoftware.atlassian.net/browse/TAT-4323) |

## **Fast follow**

* Lighter trades in social feeds (Social team, needs design and scoping)
* Choice between fast and standard withdrawal for large amounts
* LIT growth campaigns in product (BD / Growth / Rewards)

## **Out of scope**

* mUSD as collateral (possible follow-up with the Money lane)
* Unified cross-margin across venues
* US support
* Automatic routing between venues (v1 logs all-in cost per venue to decide later)

## **User scenarios and flows**

All flows are in the [Figma file](https://www.figma.com/design/RKxgK44BoVRyKtmjjP4SFc/PERPS---13-Jul---xx-Nov?node-id=15205-233711&m=dev), grouped as Intro, Deposit and withdraw, Market list, Settings, Trade lite and Trade pro.

1. First access: welcome page, then default provider in settings
2. Fund: deposit to Lighter with any token or Money account, or move funds from Hyperliquid
3. Discover: browse one row per market and filter by provider
4. Trade (lite): open a long or short on the selected provider, or switch provider at trade time
5. Trade (pro): compare providers, pick one and place the order with the same size
6. Manage: see positions, orders and activity across providers, then withdraw

# **Assumptions**

| Type | Assumption | How we validate it |
| :---- | :---- | :---- |
| Business | The VIP fee ladder can beat the CEX bar on Lighter and still make money. | Strategy & Monetization and Finance pricing, mid-November |
| Users | Hyperliquid as a trusted default keeps the multi-venue concept simple for retail users. | Usability round before Oct 31 design sign-off; conversion guardrail metric |
| Feasibility | The Lighter PoC and current controller work cover trading parity, and Relay covers deposits and withdrawals. | PoC on mobile; core PRs for LighterProvider; Relay Lighter docs |

# **Technical approach**

## **Architecture overview**

Lighter is added as a second provider in the perps-controller in core, next to Hyperliquid, and surfaced through the existing Mobile perps screens. The perps backend indexes and caches Lighter markets and returns them in the same market structure as Hyperliquid, so the client keeps venue-specific logic to a minimum. Deposits, withdrawals and trading with any token go through the Confirmations team's flows.

## **Integration details**

* Order signing uses Lighter's WASM signer, which needs a security audit before launch.
* A second websocket connection runs next to Hyperliquid, so performance is audited during build and before launch.
* Lighter's APIs are geo-blocked server-side, unlike Hyperliquid's. Mismatches with our geoblock list and VPN changes mid-session need handling, ideally with network change detection on Mobile.
* Deposits and withdrawals go through Relay, which needs an extra Lighter account creation step. Lighter fast withdrawal to Arbitrum lands in 15 to 20 seconds but depends on liquidity.
* Retail orders carry Lighter's 300 ms speed bump; VIP accounts are exempt.
* The MetaMask builder fee is collected on Lighter orders, which needs a fee wallet setup.

## **Functional requirements**

* Full trading parity in lite and pro: open, close, limit, TP/SL, cancel, order and position history
* Default provider setting drives market data, market detail and trade defaults
* Deposits, withdrawals, margin and positions are venue-scoped; cross-venue surfaces attribute each row to its provider
* Provider badge on market logos, reusing the network badge pattern from spot tokens
* Correct final fee on preview, confirmation, receipt and history; never a Hyperliquid-derived total on a Lighter order

## **Non-functional requirements**

* Performance: no regression in perps load time with two venue connections
* Security: WASM signer audit completed before the VIP beta
* Analytics: venue, tier and trade\_origin on every Segment event; new screens use existing events
* Reliability: visible outage state when Lighter is degraded

## **Edge cases and error states**

* Same market on both providers: one row, with data from the default provider
* User holds a position on one provider while viewing the same market on the other
* Not enough USDC on the selected provider when paying
* Fast withdrawal unavailable for large amounts because of liquidity
* User in a region Lighter blocks but MetaMask allows, or VPN switched mid-session
* Lighter returns returnOnEquity in percent while Hyperliquid uses a fraction (fix in core PR 11080\)

## **Open questions**

- [ ] RFQ: finish the epic (TAT-4323), designs and sizing
- [ ] Web terminal: confirm Lighter launch scope and fee wallet setup
- [ ] Confirmations team effort for deposit, withdraw and trade with any token
- [ ] Owner and delivery date for the Rive welcome animation
- [ ] Final copy, and LIT campaign mechanics

## **Alternatives considered**

| Option | Pros | Cons | Decision |
| :---- | :---- | :---- | :---- |
| Cut the builder fee on Hyperliquid | No new venue to build | Still above the CEX bar even at 0 bps | Rejected |
| Cut the builder fee on Lighter for all traders | Broadly competitive | Puts retail revenue at risk | Rejected for v1; revisit after the beta |
| Add Lighter as a second venue, VIP closed beta first | Meets the CEX bar for VIPs; reduces Hyperliquid dependency | More UX and infrastructure work | Chosen |

# **Dependencies**

| Team | What we need | Owner | Needed by | Status |
| :---- | :---- | :---- | :---- | :---- |
| UXR / Design / Product | Final designs, including a new usability round | [Raphaela Schiefersteiner](mailto:raphaela.schiefersteiner@consensys.net)[Nikki Pham](mailto:nikki.pham-ext@consensys.net)[Matthieu Saint Olive](mailto:matthieu.saintolive@consensys.net) | Oct 31 | In progress |
| Design (motion) | Rive animation for the welcome page | [Javier Oliver](mailto:javier.oliver-ext@consensys.net) | \[Date\] | Not started |
| Strategy & Monetization, Finance | VIP fee ladder for both venues | Ajay, Tivas, Casey | Mid-November | Open |
| Leadership (Product, BD) | LIT token allocation | \[Name\] | End of November | Open |
| Confirmations | Deposit, withdraw and trade with any token on Lighter, including Money account | [Barbara Schorchit](mailto:barbara.schorchit@consensys.net) | Dec 15 | Discovery started |
| Social | Lighter trades in social feeds | [Rizvi Haider](mailto:rizvi.haider@consensys.net) | Dec 15 | Not started (needs scoping) |
| BD / Growth / Rewards | LIT growth campaigns | Rosalie, Christian | Dec 15 | Discovery started |
| Growth | Notifications parity for Lighter, matching Hyperliquid | [Manlio Poltronieri](mailto:manlio.poltronieri@consensys.net) | \[Date\] | Not started |
| Security | WASM signer audit | [Ohm Shah](mailto:ohm.shah@consensys.net) | Week 4 | Not started |
| Marketing | Launch plan and messaging | [Candace Qi](mailto:candace.qi@consensys.net) | January | Not started |
| Support | CS training, docs and runbook | [Christian Eck](mailto:christian.eck@consensys.net) | January | Not started |

Also align geo-blocking with Lighter's server-side blocks, and set up the fee wallet for Lighter builder fees.

# **Definition of Ready**

- [ ] Go decision from the product review recorded
- [ ] Designs final in Figma, including empty, loading and error states
- [ ] VIP fee ladder agreed
- [ ] Confirmations effort sized and committed
- [ ] RFQ designed and sized
- [ ] Jira epics and tickets created and estimated
- [ ] Feature flag strategy agreed

# **Plan and estimate**

## **Milestones**

| Milestone | Scope | Platform | Estimate | Target date | Jira |
| :---- | :---- | :---- | :---- | :---- | :---- |
| M0: Lighter PoC | View positions, markets and market data, and place orders | Mobile | Done | Done |  |
| M1: Build | New components and flows (welcome, settings, perps home, market list, market detail, pro); backend market index; Confirmations integration | Mobile / Backend | 3 weeks | \[Week 3\] |  |
| M2: Testing and audits | E2E tests with QA, performance audit, WASM signer audit, manual testing and UAT | Mobile | 1 week | \[Week 4\] |  |
| M3: Bug fix and buffer | UAT fixes; internal dogfood on mainnet at small size | Mobile | 1 week | \[Week 5\] |  |
| M4: VIP closed beta | Flag on for VIPs and hand-picked traders, then retail | Mobile | n/a | Before mid-Jan 2027 |  |

## **Staffing**

| Engineer | Area | Allocation |
| :---- | :---- | :---- |
| [Arthur Breton](mailto:arthur.breton@consensys.net) | Perps controller, Lighter provider | 20% |
| [Matthew Denton](mailto:matthew.denton@consensys.net) | Mobile UI | 100% |
| [Michal Szorad](mailto:michal.szorad@consensys.net) | Mobile UI | 100% |
| [Devin Stewart](mailto:devin.stewart@consensys.net) | Backend | 50% |

Sizing from the product review: 5 weeks with 2 perps engineers and 1 designer. Confirmations and Social effort is not sized yet.

# **Risks**

## **Risks of delivering**

| Risk type | Risk | Likelihood | Impact | Mitigation | Owner |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Users | Multi-venue concept confuses retail users and lowers conversion | Medium | High | Reduce: Hyperliquid as the trusted default; welcome page | Matthieu Saint Olive |
| Tech | A second venue connection slows down perps | Medium | High | Reduce: perps backend for market data; performance audits during build and before launch | Alejandro Garcia, Arthur Breton |
| Business | VIP fee ladder is not competitive enough, or not profitable | Medium | High | Reduce: pricing work with Finance before launch | Strategy & Monetization |
| Users | High slippage on large Lighter orders | Medium | High | Reduce: slippage control, RFQ, TWAP and scale orders; VIP communication | Nicole, Sy (GTM/BD) |
| Business | LIT campaigns bring short-lived users | High | Medium | Reduce: campaigns over 12 months, for activation and retention | Rosalie, Christian |
| Tech | Lighter geo-blocking differs from ours, or VPN changes mid-session | Medium | Medium | Reduce: network change detection on Mobile; clear error state | Perps engineering |
| Delivery | Confirmations or Social lack bandwidth before Dec 15 | Medium | Medium | Accept: launch without Lighter social support if needed; size Confirmations work early | Matthieu Saint Olive, Rizvi Haider, Alejandro Garcia |

## **Risks of not delivering**

| Risk type | Risk | Mitigation |
| :---- | :---- | :---- |
| Users | VIPs keep paying about 14 bps and trade elsewhere | Accept: VIP pilot fees on Hyperliquid only |
| Business | VIP program launches in January without a fee offer that meets the CEX bar | None at similar cost: a 0 bps builder fee on Hyperliquid still misses the bar |
| Tech | Revenue stays fully dependent on Hyperliquid | None: a second venue is the mitigation |

# **Rollout and quality**

- [ ] Feature flag for Lighter, with internal, VIP and retail stages
- [ ] Unit test coverage for the Lighter provider and new components
- [ ] E2E tests with QA
- [ ] Performance audit with two venue connections
- [ ] Venue, tier and trade\_origin on every Segment event; all-in cost logged for both venues
- [ ] Sentry alerts for Lighter order failures and websocket errors
- [ ] WASM signer security audit completed
- [ ] Release validation owner assigned for Mobile
- [ ] Rollout: internal dogfood on mainnet at small size, then VIP closed beta, then retail
- [ ] Rollback plan documented, including what users with open Lighter positions see when the flag is off
- [ ] Support docs, FAQ and runbook ready

## **RC bug policy**

For the RC, fix only crashes, broken core flows, privacy or security leaks, and Legal items. Everything else moves to the next release.

# **Exit criteria**

* Done when: Lighter is live for VIPs in closed beta on Mobile with trading parity, and the success metrics are tracked
* Cancel or postpone if: no Go decision, the VIP fee ladder cannot beat the CEX bar profitably, or Lighter fails the performance or security audit

# **Decision log**

| Date | Decision | Context | Decided by |
| :---- | :---- | :---- | :---- |
| Oct 21, 2026 | Product review asks for Go on Lighter in Mobile and web app (closed beta) | [Product review deck](https://docs.google.com/presentation/d/1k5A6pANdNumzb-h1pYAHQx3KJLL-pZMmzgAomfQV-pI/edit) | Pending |
| Oct 21, 2026 | Relay supports Lighter deposits and withdrawals; Lighter fast withdrawal is available | [Withdrawal thread](https://consensys.slack.com/archives/C08U6DYNJ1G/p1792601602957559) | Perps, Confirmations |
| Oct 22, 2026 | V1 must-haves defined: money deployment, trading parity, venue-scoped balances, market discovery, fees, speed bump, degradation, instrumentation, flagged rollout | [V1 must-haves (Slack)](https://consensys.slack.com/archives/D06FURKQVRD/p1792660465426369) | Matthieu Saint Olive |
| Oct 28, 2026 | RFQ added to Lighter v1 scope | \#perps-leads | Matthieu Saint Olive |

