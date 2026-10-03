# Thouq · Technical Documentation
 
Portfolio Project · Stage 3
 
| | |
|---|---|
| Project | Thouq (ذوق), a group dining planner |
| Team | Shatha Alanzi, Asim Alhubaishi, Hassan Alhuzali, Fahad Almidaj |

## Contents

0. [User stories and mockups](#0-user-stories-and-mockups)
1. [System architecture](#1-system-architecture)
2. [Components, classes, and database design](#2-components-classes-and-database-design)
3. [Sequence diagrams](#3-sequence-diagrams)
4. [API specifications](#4-api-specifications)
5. [SCM and QA plans](#5-scm-and-qa-plans)
6. [Technical justifications](#6-technical-justifications)

---

## 0. User stories and mockups

### Terms

| Term | Meaning |
|---|---|
| Group | A saved set of people who go out together. It stays after an outing ends. |
| Outing | One occasion inside a group. Each outing has its own preferences, plan, vote, and result. |
| Plan | The list of suggested restaurants for one outing. |
| Registered user | A person with an account (name and phone number). |
| Organizer | The registered user who created the group and runs its outings. |
| Member | A registered user who joined a group. Membership is permanent. |
| Guest | A person without an account who joins one outing with a name only. |
| Participant | An organizer, member, or guest taking part in an outing. |

### Key decisions

The stories below are built on these decisions.

- **Accounts:** Users sign up with their name and phone number and log in with a one-time verification code. There are no passwords.
- **Saved groups:** A member joins a group once. The organizer can start a new outing without re-inviting members.
- **First outing:** Creating a group starts its first outing automatically. The plan, the vote, and the invite link belong to the outing, not to the group.
- **New outings and attendance:** When the organizer starts a new outing in a saved group, every member, including the organizer, receives a notification and confirms whether they are coming. Only those who confirm take part in the plan and the vote. A member who does not respond is not included, but can still confirm until the organizer generates the plan. There are no automatic reminders in the first version.
- **Invite link:** One link per outing. A registered user who opens it becomes a permanent group member. A guest who opens it joins that outing only. Joining from the link counts as confirming attendance.
- **Guests:** Guests have no account, join with a name only, and need a new link for each outing unless they sign up.
- **Group size:** Up to 8 people, including the organizer. When the group is full, a message says so.
- **Preferences:** Editing them for an outing is optional, applies to that outing only, and does not change the account.
- **Allergies:** Shown to the group as a warning only. The app does not filter restaurants by allergens and does not guarantee that a restaurant is safe.
- **Plan:** The organizer generates the plan once participants have entered their preferences.
- **Voting:** One vote per person by default. A participant can change their vote until the organizer closes voting. In a tie, the organizer chooses among the tied restaurants.
- **Restaurant data:** The team's Riyadh restaurants dataset (version 1, prepared 29 September 2026). It is a snapshot and does not update automatically. The app suggests only places marked as open.

### Prioritized user stories

Stories are prioritized with the MoSCoW method: Must Have, Should Have, Could Have, and Won't Have.

#### Must Have

16 stories the app cannot work without.

| # | Title | Role | User story |
|---|---|---|---|
| 1 | Sign up | New user | As a new user, I want to sign up with my name and phone number, so that I can create or join groups and keep my preferences saved. |
| 2 | Log in | Registered user | As a registered user, I want to log in with a verification code sent to my phone, so that I can access my account without a password. |
| 3 | Save preferences | Registered user | As a registered user, I want to save my allergies and preferences, so that I don't have to re-enter them every time. |
| 4 | Create a group | Organizer | As an organizer, I want to create and name a group and start its first outing, so that I can bring people together to decide where to eat. |
| 5 | Invite | Organizer | As an organizer, I want to send an invite link for the outing, so that people can join quickly. |
| 6 | Join a group | Member | As a member, I want to join a group from the invite link, so that I can take part in the decision. |
| 7 | Join as a guest | Guest | As a guest, I want to join an outing from the link using only my name, without an account, so that I can take part quickly. |
| 8 | Outing preferences | Organizer, Member | As an organizer or member, I want to see my saved preferences and edit them for this outing if needed, so that they fit the outing without changing my account. |
| 9 | Guest preferences | Guest | As a guest, I want to enter my allergies and preferences for this outing, so that the group takes them into account. |
| 10 | Track progress | Organizer | As an organizer, I want to see who has joined and who has completed their preferences, so that I know when to generate the plan and when to close voting. |
| 11 | Generate the plan | Organizer | As an organizer, I want to generate restaurant suggestions that match the participants' preferences, with the group's allergies shown as a warning, so that we can choose with everyone's needs in mind. |
| 12 | View the plan | Participant | As a participant, I want to browse the restaurants in the plan, so that I know the options before voting. |
| 13 | Vote | Participant | As a participant, I want to vote for a restaurant from the plan and change my vote until voting closes, so that my opinion counts. |
| 14 | Close voting | Organizer | As an organizer, I want to close voting, so that we can move on to the final decision. |
| 15 | Confirm the winner | Organizer | As an organizer, I want to confirm the winning restaurant, choosing among the tied ones if there is a tie, so that everyone receives the final decision. |
| 16 | See the result | Member, Guest | As a member or guest, I want to see the winning restaurant once the organizer confirms it, so that I know where we are going. |

#### Should Have

11 stories that add real value, but the app works without them.

| # | Title | Role | User story |
|---|---|---|---|
| 17 | Recommendation reason | Participant | As a participant, I want to see why each restaurant was recommended, so that I can trust the suggestion. |
| 18 | Browse restaurants | Registered user | As a registered user, I want to browse restaurants, so that I can see the available options. |
| 19 | Personal plan | Registered user | As a registered user, I want to see suggested restaurants after setting my preferences, so that I know what suits me. |
| 20 | Remove people | Organizer | As an organizer, I want to remove a member or guest, so that only the intended people stay in the group. |
| 21 | Exclude restaurants | Organizer | As an organizer, I want to exclude restaurants from the plan and restore them later, so that I can remove what doesn't suit us without losing it for good. |
| 22 | My groups | Organizer, Member | As an organizer or member, I want to see my saved groups and their outings, so that I can return to them easily. |
| 23 | Start a new outing | Organizer | As an organizer, I want to start a new outing in my saved group, so that we can decide again without re-inviting everyone. |
| 24 | Confirm attendance | Organizer, Member | As an organizer or member, I want to receive a notification when a new outing starts and confirm whether I am coming before the plan is generated, so that the plan and the vote include only the people attending. |
| 25 | Attendance responses | Organizer | As an organizer, I want to see who has confirmed, who has declined, and who has not responded, so that I know who is coming before I generate the plan. |
| 26 | Member notifications | Member | As a member, I want to receive a notification when the plan is updated, so that I don't miss any change. |
| 27 | Restaurant location | Participant | As a participant, I want to open the winning restaurant's location in Google Maps, so that I can get there easily. |

#### Could Have

4 stories to add if time allows.

| # | Title | Role | User story |
|---|---|---|---|
| 28 | Narrow the options | Organizer | As an organizer, I want to reduce the number of suggested restaurants, so that choosing is easier. |
| 29 | Voting settings | Organizer | As an organizer, I want to set whether each person gets one vote or several, so that voting fits how my group decides. |
| 30 | Guest notifications | Guest | As a guest, I want to receive a notification when the plan is updated while the app is closed, so that I don't miss any change. |
| 31 | Sign up after the outing | Guest | As a guest, I want to create an account after the outing, so that I stay in the group without needing a new link each time. |

#### Won't Have

Out of scope for the first version.

- Ordering food or delivery through the app.
- Restaurant reservations.
- Payment options for an outing (splitting the bill, a draw, or one person covering it). Planned for a later version.
- Processing payments or transferring money through the app.
- Filtering restaurants by allergens or guaranteeing that a restaurant is safe.
