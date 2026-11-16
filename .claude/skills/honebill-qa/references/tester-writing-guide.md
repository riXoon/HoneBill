# Writing for the testers

The testers are real people, mostly non-technical, on cheap Android phones, often reading on a small screen between other things. Write so that someone who has never heard of Stellar can run the test and send back something useful.

## Rules of thumb

- **Plain words.** Say "your Offline balance", "the payment", "the reference code on the receipt", "turn off mobile data", "swipe the app away from Recent apps". Never use "outbox", "nonce", "sync step", "409", "contract", "SEP-10", "voucher XDR". "Text" or "SMS" is fine.
- **One thing per step.** Number the steps. Each starts with a verb: "Open", "Tap", "Turn off", "Wait 1 minute".
- **Say exactly how long to wait.** "Wait 40 seconds" is useful; "wait a bit" isn't.
- **Expected results are things you can see.** Quote the app's words where possible (copy them from `apps/mobile/src/i18n/en.ts`).
- **Say why the test matters in one line.** People test better when they know what to look for: "We want to be sure money is never taken twice."
- **Make reporting easy.** Every card ends with what to send if it goes wrong.
- **Be warm.** "If anything feels off, even if you're not sure it's a bug, tell us. That's exactly what we need."

## Pack structure

```markdown
# HoneBill test session: <name>
**Date:** … · **App version:** … · **Session length:** …

## Before you start
(checklist: app version, balances, partner's short ID, phone charged, screen recording turned on, clock showing seconds)

## How to make your phone "offline"
(the conditions this session uses, in tester words: C1, C2, C3, …)

## How to report a problem
(the bug report template below)

## Test cards
(cards, grouped by area, P0 first)

## Your assignments
(table: tester → card IDs, partner)
```

## Card format (the tracker script parses this exactly)

Every card **must** use this shape. `scripts/cards_to_xlsx.py` finds cards by the `### ID · Title` heading and reads the bold labels. The separator between ID and title can be `·`, `-`, `–` or `:`. IDs are letters + number, e.g. `OFF-01`, `SEND-03`, `GRP-02`.

```markdown
### OFF-03 · Pay offline, then close the app before answering

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 10 min · **Costs:** ₱5 from A's Offline balance

**Why:** If the phone closes at the wrong moment, the payment must still go through, and only once.

**Before you start:**
- A has at least ₱10 in the Offline balance.
- B is online with HoneBill open on Home.

**Steps:**
1. A: Turn off mobile data and Wi-Fi. Leave Airplane mode OFF (texts must still work).
2. A: Send ₱5 to B. On "How do you want to send?", choose SMS.
3. A: In the messages app, press Send.
4. A: Do not go back to HoneBill. Open Recent apps and swipe HoneBill away.
5. B: Wait up to 3 minutes and watch for a text and your balance.
6. A: Turn mobile data back on. Open HoneBill and sign in.

**You should see:**
- B gets a text saying A paid ₱5, and B's balance goes up by ₱5. Only once.
- A, after step 6, sees the ₱5 payment in History as done, once.

**Report if:**
- B is paid twice, or not at all after 10 minutes.
- A's History shows the payment twice, or shows it failed.
- Send: screenshots of A's History and B's History, the time of step 3, both phone models.
```

Field notes:
- **Priority:** P0 (money or access wrong), P1 (can't tell what happened), P2 (rough edges).
- **People:** say the roles. For two phones on one account, write "A on two phones (A1, A2)".
- **Costs:** omit it if the card spends nothing.
- **Steps:** prefix the actor (`A:`, `B:`, `Everyone:`) on multi-person cards.
- Keep **Report if** concrete. Always ask for screenshots, the time, and the reference code where there is one.

## Bug report template (put in the pack once)

```
Card: (e.g. OFF-03)
Your name / phone model / Android version:
App version (bottom of Profile):
Online or offline? (Wi-Fi / mobile data / none / weak signal):
What you did (steps):
What you expected:
What happened instead:
Time it happened (with seconds if you can):
Reference code on the receipt (if any):
Screenshots or screen recording: attached? yes/no
Can you make it happen again? yes / no / didn't try
```

Tell testers they can also send a report from inside the app (Profile → Help & Feedback). It works offline and attaches the app version.

## Tips that save a session

- Ask everyone to **turn on screen recording** for offline and stress cards. Android has a built-in recorder in Quick Settings.
- Ask everyone to show **seconds on the clock** (or open the Clock app) so times line up with server logs.
- Pair testers who sit together for A/B cards. Remote pairs need a chat to say "sent!".
- Put long-waiting cards (14-day, 1-hour offline) on a separate "take home" list.
