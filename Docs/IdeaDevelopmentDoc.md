# Portfolio Project — Stage 1 Report

## Team Formation and Idea Development

**Team:** Asim Alhubaishi, Shatha Alanzi, Fahad Almidaj, Hassan Alhuzali
**Selected MVP:** Thouq (ذوق) — a group dining decision and booking app

---

## Table of Contents

- [1. Team Formation](#1-team-formation)
- [2. Process Followed](#2-process-followed)
- [3. Ideas Explored](#3-ideas-explored)
- [4. Selected MVP: Thouq](#4-selected-mvp-thouq-ذوق)
- [5. Challenges and Mitigation](#5-challenges-and-mitigation)
- [6. Outcome](#6-outcome)

---

## 1. Team Formation

| Member | Role | Main responsibilities |
| --- | --- | --- |
| Shatha Alanzi | Project Manager / Full-stack | Planning, backlog, backend and integration work |
| Asim Alhubaishi | Backend Developer | authentication, suggestion engine |
| Fahad Almidaj | Backend Developer | API, database |
| Hassan Alhuzali | QA | Wireframes, user testing, test plans, bug tracking |

Roles define ownership, not boundaries. Everyone reviews code and joins technical decisions.

**Collaboration:** a group chat for daily questions, one weekly sync, a shared GitHub Projects board, feature branches with pull requests reviewed by at least one member, and a shared workspace for notes and decisions. When we disagree, we discuss first, vote if needed, and write down the reasoning so the same debate doesn't repeat.

---

## 2. Process Followed

1. **Individual ideation** — each member brought an idea based on a problem they had seen firsthand.
2. **Pitch round** — ideas presented without immediate criticism.
3. **Research** — a quick scan of existing solutions, required data, and required integrations for each idea.
4. **Evaluation** — scored against shared criteria: problem clarity, technical feasibility, time fit, dependency on data or partners, regulatory risk, differentiation, and team interest.
5. **Elimination** — the biggest risk of each idea was examined; three ideas were rejected with documented reasons.
6. **Refinement** — the selected idea was cut down to a deliverable MVP, with everything else moved to a roadmap.

---

## 3. Ideas Explored

### 3.1 Drone Fleet Management System

A platform for organizations running multiple drones: location and flight tracking, check-in/check-out logs, usage history per unit, and environmental readings such as temperature.

**Strengths:** a real operational need, technically interesting telemetry work, and clear accountability value.

**Why we rejected it:**

- Mature open-source alternatives already cover most of the functionality, and we found no gap we were positioned to fill.
- The scope is very large — telemetry ingestion, live mapping, asset management, and reporting are each a project on their own.
- Meaningful testing needs real drones transmitting real data. Without hardware we would build against simulated input and miss the problems that matter.
- The reachable user base is small, so user research and validation would be nearly impossible.

### 3.2 Grocery inventory and checkout

Small neighborhood groceries track stock on paper or not at all. The owner finds out an item is finished when a customer asks for it, so he loses the sale. He also has no idea which items move fastest, so he restocks by guessing. On the other side, a customer drives to the store and comes back without the thing he went for.

We looked at two versions of this.

The first one had card payments, barcode scanners, receipt printers and offline mode. We dropped that quickly. Too much for the time we have.

The second version was smaller:

- A simple checkout screen for the seller. He picks the items, confirms, and the stock count goes down as a result of that sale.
- A low-stock list and a daily sales summary.
- A search page for customers: find an item, see which nearby store has it and at what price.
- Reserve for pickup. Cash on collection. No online payment, no delivery, no hardware.

The important design decision in this version is that our system is the cashier, not a separate stock book next to it. If the sale does not pass through the system, nothing decrements and the numbers drift within days. That is also what makes the customer-facing page possible at all, because a customer will not trust availability that is a week old.

This version fits our time and it has a real technical core. Selling the last unit of an item from two places in the same second has to be handled inside the database, in one step with a rule that refuses a negative result. Otherwise both sales read the same number, both write zero, and we sold something we do not have.

So we did not drop this idea because it was too hard. We dropped it because of e-invoicing. A business registered for VAT in Saudi Arabia has to follow ZATCA's e-invoicing rules, which include a required invoice format and integration with their platform. A system that issues sales invoices without meeting those rules cannot be used by a store that falls under them. We could demo it, but no real shop could actually run on it, and being usable by a real user was one of our criteria. Cutting features does not remove this.

[Before submitting: check ZATCA's site for the current VAT registration limit and which integration wave applies. If small groceries fall below the limit, this paragraph has to change, and the reason for dropping the idea becomes the adoption problem below instead.]

Two other problems we would have had to live with:

- Someone has to enter hundreds of items before the system is useful. Our plan was a shared product list keyed by barcode, so each store only adds its own price and quantity. The first load is still a lot of work.
- The numbers stay correct only if the owner runs every single sale through the system. That is a habit problem, not a code problem, and we have no control over it.

### 3.3 Instant payouts for delivery workers

Paying delivery and store workers their earnings immediately instead of waiting for the platform's settlement cycle, then collecting when the platform pays.

Moving other people's money needs approval from the financial regulator, and that takes much longer than this project. It also needs real money to front the payouts, which we don't have. And it only works if delivery platforms agree to share earnings data and settle with us. None of these are engineering problems.

### 3.4 Thouq ✅ Selected

**Strengths:** a frequent, recognizable problem; an MVP deliverable without hardware, payments, or licensing; easy to test with real groups; and a clear expansion path into dishes, bookings, and restaurant partnerships.

**Weaknesses:** it needs a reliable source of restaurant data, fair aggregation of conflicting preferences is genuinely hard, and value depends on invitees actually responding.

### 3.5 Comparison

| Criterion (1–5) | Drone | Grocery POS | Payouts | **Thouq** |
| --- | --- | --- | --- | --- |
| Problem clarity | 4 | 5 | 5 | 4 |
| Technical feasibility | 2 | 2 | 2 | 4 |
| Time fit | 1 | 2 | 1 | 4 |
| Data / partner dependency | 2 | 1 | 1 | 3 |
| Regulatory risk (5 = low) | 3 | 2 | 1 | 5 |
| Differentiation | 2 | 2 | 3 | 4 |
| Team interest | 3 | 3 | 4 | 5 |
| **Total (max 35)** | **17** | **17** | **17** | **29** |

Each rejected idea failed on a different axis: the drone system on scope and audience, the POS on integration and compliance, the payout layer on licensing and capital. Thouq was the only one whose main obstacles were product problems we could solve ourselves.

---

## 4. Selected MVP: Thouq (ذوق)

### 4.1 Summary

Deciding where a group eats is a problem everyone recognizes. Someone suggests a place, two people object, several stay silent, and the decision either collapses or defaults to whoever pushed hardest. The information needed to decide well — who's coming, what they can't eat, what they can spend, where they're coming from — sits scattered across a chat thread and never gets assembled.

Thouq assembles it. One person creates an outing and shares an invite link. Each participant adds their preferences in seconds without installing anything. Thouq combines those inputs into ranked restaurant suggestions that respect the group's hard constraints and balance its soft ones. The group votes, confirms, and the outing ends in a real reservation rather than an unresolved conversation.

### 4.2 Scope

**Phase 1 — MVP:**

| # | Feature |
| --- | --- |
| 1 | Create an outing: date, time, area, occasion type, group size |
| 2 | Invite link that participants can join and answer without a heavy signup |
| 3 | Preference capture: cuisine, budget range, dietary restrictions and allergies, seating needs |
| 4 | Aggregation: allergies and dietary rules as hard filters, soft preferences as weighted ranking |
| 5 | Ranked restaurant suggestions, each with the reason it was suggested |
| 6 | Voting and organizer confirmation |
| 7 | Outing summary visible to everyone |

**Phase 2 — differentiating features:** dish-level recommendations per person, reservation integration, a restaurant dashboard for menus and availability, location-aware suggestions that balance where people are coming from, preference memory that learns from completed outings, occasion-aware filtering (family sections, private rooms, large-group capacity), and group history so recurring groups don't rediscover the same debate.

**Phase 3:** AI personalization built on the accumulated preference data, and a conversational option on the invite link for people who'd rather talk than fill a form.

### 4.3 Why It Isn't Easily Replaceable

A single-purpose voting tool can be replaced by a poll in any chat app. Thouq's position rests on three things:

1. **It owns the whole decision.** Map and review apps help one person search; chat apps help a group talk. Neither turns scattered group constraints into a decision and then into a booking.
2. **Preference data compounds.** Every completed outing teaches the system about individuals and about how groups behave together — data a competitor starting from zero cannot copy.
3. **It becomes two-sided.** Once restaurants connect for bookings and menu data, the product sits between groups that are deciding and venues that want that demand.

### 4.4 Rationale for Selection

- **Feasibility:** no hardware, no payment processing, no licensing, and no partner required before it works.
- **Time fit:** the core loop — create, invite, collect, suggest, vote, confirm — is small enough to build and test properly.
- **Testability:** we can run usability sessions with real groups immediately, which was impossible for the other three ideas.
- **Technical depth:** aggregation logic, the invite-link flow, and the data model give real engineering substance beyond CRUD.
- **Expandability:** dishes, bookings, and restaurant tooling extend the same core instead of requiring a rewrite.
- **Team fit:** frontend, backend, UX, and product work are all genuinely needed.

### 4.5 Impact and Opportunities

For groups, a decision in minutes instead of an open-ended thread, with quieter participants' constraints respected rather than overridden. For people with allergies or dietary rules, those constraints are enforced by the system instead of re-explained every time. For restaurants, access to groups at the moment of decision, with accurate party sizes. For the team, end-to-end experience delivering a product from problem to working MVP.

Group dining is frequent and socially central in our market, and occasion types like family sections, private rooms, and large-group capacity are poorly served by existing search tools. Revenue paths through restaurant partnerships and bookings exist but aren't required for the MVP to work, and the same group-decision engine could later extend beyond restaurants to activities and events.

---

## 5. Challenges and Mitigation

| Challenge | Mitigation |
| --- | --- |
| Restaurant data source | Start with a curated dataset for one city or district, then move to an API or partner-supplied data |
| Fair preference aggregation | Separate hard filters from weighted soft preferences, and show why each option was suggested |
| Participation drop-off | Keep the join flow short, require no installation to answer, and produce useful suggestions from partial responses |
| Reservation integration | Begin with assisted confirmation for a few partner restaurants; automate once volume justifies it |
| Restaurant-side adoption | Deliver user-side value first, then approach venues with evidence of real group demand |
| Scope creep | Phase boundaries are fixed; Phase 2 stays in the backlog until the core loop is complete and tested |

---

## 6. Outcome

Stage 1 produced a defined MVP with documented reasoning, a feature set split into deliverable and deferred phases, identified risks with mitigations, and an aligned team with clear roles. The team is ready to move into the planning phase.
