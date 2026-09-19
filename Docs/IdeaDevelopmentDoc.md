# Portfolio Project — Stage 1 Report

## Team Formation and Idea Development

**Team:** Asim Alhubaishi, Shatha Alanzi, Fahad Almidaj, Faisal Alhuzali
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

### 3.2 Grocery Store Management System (POS, Inventory, Payments)

A cashier, inventory, and payment system for small groceries and supermarkets, similar in spirit to restaurant platforms like Foodics.

**Strengths:** a genuine need among stores still running on paper, a large potential market, and a clear subscription revenue model.

**Why we rejected it:**

- It depends on hardware we'd need to own and test against: barcode scanners, receipt printers, scales, and cash drawers.
- Card payments require integration with a certified provider and strict handling of sensitive transaction data — slow, approval-gated work.
- Retail systems must comply with mandatory e-invoicing rules, including specific invoice formats and integration with the tax authority. A non-compliant system cannot be used by any real store.
- A grocery carries thousands of SKUs. Without an existing barcode-to-product database, every store would have to enter its full inventory manually before getting any value.
- A cashier cannot stop selling when the internet drops, so the system must work offline and sync later — significantly harder than an online-only app.
- Owners resist switching because migration and retraining risk disrupting daily revenue, and established competitors already provide hardware bundles and support lines we cannot match.

### 3.3 Instant Payout Layer for Delivery and Store Workers

A service that pays workers their earnings immediately instead of after the platform's settlement cycle, recovering the money when the platform settles.

**Strengths:** addresses real cash-flow pressure, has obvious perceived value, and has a simple fee-based model.

**Why we rejected it:**

- Moving other people's money requires authorization from the financial regulator, and the approval timeline extends far beyond this project.
- The model requires real working capital to front payouts. No amount of good engineering substitutes for money we don't have.
- It only works if delivery platforms share verified earnings data and agree to settle with us — partnerships we cannot secure as students.
- Advancing funds against unsettled earnings creates exposure to cancellations, disputes, and fraud, which needs risk models and historical data we don't have.

The blockers here are regulatory and financial, not technical. Even a well-built system could not legally operate.

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
