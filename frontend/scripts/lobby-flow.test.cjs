// Leaving and removal before generation (FE-26, with BE-29 on the server).
test("the membership wrapper sends each request and rejects a reply about another outing or person", async () => {
  const calls = [];
  const api = reply => load("features/sessions/api/membership.ts", {
    "@/shared/api/client": { request: async (method, path, options) => { calls.push([method, path, options]); return reply; } },
    "@/shared/api/errors": errors,
  });
  await api({ outing_id: "o 1", participant_id: "p1" }).leaveOuting("o 1", "T");
  assert.deepEqual(plain(calls[0]), ["POST", "/outings/o%201/leave", { token: "T" }]);
  await api({ outing_id: "o 1", participant_id: "p/2" }).removeParticipant("o 1", "p/2", "T");
  assert.deepEqual(plain(calls[1]), ["DELETE", "/outings/o%201/participants/p%2F2", { token: "T" }]);
  for (const broken of [null, { outing_id: "x", participant_id: "p/2" }, { outing_id: "o 1", participant_id: "p9" }]) {
    await assert.rejects(api(broken).removeParticipant("o 1", "p/2", "T"), { code: "INVALID_RESPONSE" });
  }
});

test("mock CHEF: the organizer removes someone else, the next poll drops them, and the server's rules hold", async () => {
  const call = mockServer();
  const removed = await call("DELETE", "/outings/mock-outing-CHEF/participants/mock-reem");
  assert.equal(removed.attendance, "removed"); assert.equal(removed.total_count, 1);
  const next = await call("GET", "/outings/mock-outing-CHEF");
  assert.deepEqual(plain(next.participants.map(person => person.participant_id)), ["mock-me-CHEF"]);
  await assert.rejects(call("DELETE", "/outings/mock-outing-CHEF/participants/mock-reem"), { status: 404, code: "PARTICIPANT_NOT_FOUND" });
  await assert.rejects(call("DELETE", "/outings/mock-outing-CHEF/participants/mock-me-CHEF"), { status: 409, code: "ORGANIZER_CANNOT_LEAVE" });
  await assert.rejects(call("POST", "/outings/mock-outing-CHEF/leave"), { status: 409, code: "ORGANIZER_CANNOT_LEAVE" });
});

test("mock TEST: a participant cannot remove anyone, can leave, and then the outing refuses them", async () => {
  const call = mockServer();
  await assert.rejects(call("DELETE", "/outings/mock-outing-TEST/participants/mock-khalid"), { status: 403, code: "ORGANIZER_ONLY" });
  const left = await call("POST", "/outings/mock-outing-TEST/leave");
  assert.equal(left.participant_id, "mock-me-TEST"); assert.equal(left.attendance, "declined"); assert.equal(left.total_count, 2);
  await assert.rejects(call("GET", "/outings/mock-outing-TEST"), { status: 403, code: "LEFT_OUTING" });
});

test("leaving or being removed is final: polling stops and the refused pass is forgotten", async () => {
  for (const code of ["LEFT_OUTING", "REMOVED_FROM_OUTING"]) {
    const { clock, calls, view, open } = polling({
      reply: n => { if (n === 2) throw new errors.ApiError(403, code, ""); return { name: `poll ${n}` }; },
    });
    await open();
    await clock.advance(4000);
    assert.equal(view.error.code, code); assert.equal(clock.pending(), 0); assert.deepEqual(calls.forgot, ["TEST"]);
    await clock.advance(60000); assert.equal(calls.load, 2);
  }
});

test("an ended access says why, hides the outing, and goes home", async () => {
  const cases = [
    ["LEFT_OUTING", "غادرت هذه الجلسة. تقدر ترجع لها برمز الدعوة ما دامت مفتوحة."],
    ["REMOVED_FROM_OUTING", "أزالك المنظّم، وانتهى وصولك لهذه الجلسة."],
  ];
  for (const [code, message] of cases) {
    const lobby = lobbyScreen();
    // The hook still holds the last good state; none of it may show.
    lobby.room.state = roomState("preferences", false);
    lobby.room.error = new errors.ApiError(403, code, "");
    const { root } = await render(lobby.Screen);
    const shown = texts(root);
    assert(shown.includes(message), code);
    for (const hidden of ["عشاء الخميس", "سارة", "خالد", "TEST"]) assert(!shown.some(text => text.includes(hidden)), `${code}: ${hidden}`);
    await act(async () => button(root, "الرجوع للرئيسية").props.onPress());
    assert.deepEqual(lobby.calls.replace, ["/"]);
  }
});

const removeButtons = root => root.findAll(node => node.type === "Pressable" && String(node.props.accessibilityLabel ?? "").startsWith("إزالة"));

test("before generation the organizer removes others only, and a participant can only leave", async () => {
  const organizer = lobbyScreen();
  organizer.room.state = roomState("invite", true);
  let { root } = await render(organizer.Screen);
  assert.deepEqual(removeButtons(root).map(node => node.props.accessibilityLabel), ["إزالة خالد"]);
  assert.equal(root.findAllByType("LeaveButton").length, 0);
  await act(async () => removeButtons(root)[0].props.onPress());
  assert.equal(root.findByType("RemoveSheet").props.person.participant_id, "p2");
  // A refusal or a success only asks the server again; the room keeps what it shows until the next poll.
  await act(async () => root.findByType("RemoveSheet").props.onDone());
  assert.equal(organizer.calls.refresh, 1); assert(texts(root).includes("المشاركون ٢ / ٨"));
  await act(async () => root.findByType("RemoveSheet").props.onClose());
  assert.equal(root.findByType("RemoveSheet").props.person, null);

  for (const status of ["invite", "preferences"]) {
    const participant = lobbyScreen();
    participant.room.state = roomState(status, false, true);
    ({ root } = await render(participant.Screen));
    assert.equal(removeButtons(root).length, 0, status);
    root.findByType("LeaveButton").props.onDone();
    assert.equal(participant.calls.refresh, 1, status);
  }
});

test("after generation nobody sees leave or remove", async () => {
  for (const organizer of [true, false]) {
    const lobby = lobbyScreen();
    lobby.room.state = roomState("voting", organizer, true);
    const { root } = await render(lobby.Screen);
    assert.equal(removeButtons(root).length, 0, `organizer: ${organizer}`);
    assert.equal(root.findAllByType("LeaveButton").length, 0, `organizer: ${organizer}`);
  }
});

// The leave button and the removal sheet themselves, with a fake server and plain stand-ins for the sheet.
function membershipActions({ leave, remove } = {}) {
  const calls = { leave: [], remove: [], done: 0, closed: 0 };
  const actions = load("features/sessions/components/SessionActions.tsx", {
    "react-native": native,
    "@/shared/components": shared,
    "@/shared/theme": theme,
    "@/shared/api/errors": errors,
    "../api/membership": {
      leaveOuting: async (...args) => { calls.leave.push(args); if (leave) return leave(); },
      removeParticipant: async (...args) => { calls.remove.push(args); if (remove) return remove(); },
    },
    "../identity": { outingToken: async () => "T" },
    "./SessionChrome": { SessionSheet: "SessionSheet" },
    "./SessionLayout": { QuietButton: "QuietButton", room: {} },
  });
  return { actions, calls };
}
const confirmButtons = root => root.findAllByType("AppButton");
const alerts = root => root.findAll(node => node.type === "AppText" && node.props.accessibilityRole === "alert").map(node => node.props.children);
const khalid = { participant_id: "p2", name: "خالد", attendance: "confirmed", preferences_done: false, is_organizer: false };

test("leave asks first, sends the outing's token, closes, then refreshes; a passing failure keeps the button", async () => {
  const { actions, calls } = membershipActions();
  const { root } = await render(actions.LeaveButton, { outingId: "o1", code: "TEST", onDone: () => calls.done++ });
  const sheet = () => root.findByType("SessionSheet");
  assert.equal(sheet().props.visible, false); assert.equal(sheet().props.title, "تغادر الجلسة؟");
  await act(async () => root.findByType("Pressable").props.onPress());
  assert.equal(sheet().props.visible, true);
  await act(async () => confirmButtons(root)[0].props.onPress());
  assert.deepEqual(plain(calls.leave), [["o1", "T"]]); assert.equal(calls.done, 1); assert.equal(sheet().props.visible, false);

  const offline = membershipActions({ leave: () => { throw new errors.ApiError(0, "NETWORK_ERROR", ""); } });
  const again = await render(offline.actions.LeaveButton, { outingId: "o1", code: "TEST", onDone: () => offline.calls.done++ });
  await act(async () => again.root.findByType("Pressable").props.onPress());
  await act(async () => confirmButtons(again.root)[0].props.onPress());
  assert.deepEqual(alerts(again.root), ["تعذّرت المغادرة. حاول مرة ثانية."]); assert.equal(confirmButtons(again.root).length, 1);
});

test("a stale sheet after generation explains the lock, drops the button, stays open, and still refreshes", async () => {
  const locked = () => { throw new errors.ApiError(409, "MEMBERSHIP_LOCKED", ""); };
  const leaving = membershipActions({ leave: locked });
  let { root } = await render(leaving.actions.LeaveButton, { outingId: "o1", code: "TEST", onDone: () => leaving.calls.done++ });
  await act(async () => root.findByType("Pressable").props.onPress());
  await act(async () => confirmButtons(root)[0].props.onPress());
  assert.deepEqual(alerts(root), ["بدأ اختيار المطعم، فما عاد ينفع تغيير المجموعة."]);
  assert.equal(confirmButtons(root).length, 0); assert.equal(root.findByType("SessionSheet").props.visible, true); assert.equal(leaving.calls.done, 1);

  const removing = membershipActions({ remove: locked });
  ({ root } = await render(removing.actions.RemoveSheet, { outingId: "o1", code: "TEST", person: khalid, onClose: () => removing.calls.closed++, onDone: () => removing.calls.done++ }));
  await act(async () => confirmButtons(root)[0].props.onPress());
  assert.deepEqual(alerts(root), ["بدأ اختيار المطعم، فما عاد ينفع تغيير المجموعة."]);
  assert.equal(confirmButtons(root).length, 0); assert.equal(removing.calls.closed, 0); assert.equal(removing.calls.done, 1);
});

test("remove names the person, sends their id, cannot close mid-request, and keeps the name while closing", async () => {
  const pending = deferred();
  const { actions, calls } = membershipActions({ remove: () => pending.promise });
  const props = { outingId: "o1", code: "TEST", person: khalid, onClose: () => calls.closed++, onDone: () => calls.done++ };
  const screen = await render(actions.RemoveSheet, props);
  const named = () => screen.root.findAll(node => node.type === "AppText" && node.props.children === "خالد").length;
  assert.equal(screen.root.findByType("SessionSheet").props.title, "إزالة مشارك؟"); assert.equal(named(), 1);
  let press;
  await act(async () => { press = confirmButtons(screen.root)[0].props.onPress(); });
  assert.equal(confirmButtons(screen.root)[0].props.disabled, true);
  await act(async () => screen.root.findByType("SessionSheet").props.onClose());
  assert.equal(calls.closed, 0);
  await act(async () => { pending.resolve(); await press; });
  assert.deepEqual(plain(calls.remove), [["o1", "p2", "T"]]); assert.equal(calls.closed, 1); assert.equal(calls.done, 1);
  await screen.update({ ...props, person: null });
  assert.equal(screen.root.findByType("SessionSheet").props.visible, false); assert.equal(named(), 1);
});

test("someone already gone is final, and closing clears the message for next time", async () => {
  const { actions, calls } = membershipActions({ remove: () => { throw new errors.ApiError(404, "PARTICIPANT_NOT_FOUND", ""); } });
  const { root } = await render(actions.RemoveSheet, { outingId: "o1", code: "TEST", person: { ...khalid, name: null }, onClose: () => calls.closed++, onDone: () => calls.done++ });
  assert(root.findAll(node => node.type === "AppText" && node.props.children === "مشارك").length === 1);
  await act(async () => confirmButtons(root)[0].props.onPress());
  assert.deepEqual(alerts(root), ["هذا المشارك ما عاد في الجلسة."]); assert.equal(confirmButtons(root).length, 0); assert.equal(calls.done, 1);
  await act(async () => root.findByType("QuietButton").props.onPress());
  assert.equal(calls.closed, 1); assert.deepEqual(alerts(root), []);
});