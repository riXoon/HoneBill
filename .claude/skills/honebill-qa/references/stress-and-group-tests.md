# Stress and group tests (people, not scripts)

Real people on real phones find what load scripts miss: shared Wi-Fi, a cell tower full of people, a dozen phones reconnecting at once, someone mashing buttons. These tests need **coordination**: a call or a room, a countdown, and synced clocks (everyone opens the phone clock with seconds showing).

Before a group test, the developer should:
- tail backend logs (or watch the Vercel/host log stream), filtered for `429`, `rate limited`, `replay`, `Relayer`, `timeout`;
- note the relayer's testnet XLM balance (each settlement costs a fee);
- check `/api/v2/health` is green;
- write down the start time of each round so log lines can be matched to rounds.

Each round: **countdown → action → everyone writes down the time and result → wait 3 min → compare**.

## Contents
G1 Rate limits shared by a group · G2 Settlement throughput · G3 Reconnect storm · G4 Races on one account · G5 Button-mashing · G6 Long sessions · G7 Data volume

---

## G1. Rate limits shared by a group

**G1.1 Shared IP throttle** (P0. This may be a real underlying problem.)
Setup: 8+ testers on the **same Wi-Fi**, all signed in.
Round 1: on "go", everyone pull-to-refreshes Home 5 times in 20 s.
Round 2: same, but half the group on mobile data instead.
Expected: everyone gets fresh data. Nobody sees "Too many requests".
What it hunts: the global limit is 120 requests / 60 s keyed by IP, and `wallet/balance` is 10 / 10 s. The backend sets no `trust proxy`, so behind Vercel/a proxy **every user may share one IP bucket**, and a few dozen active users would lock out everyone. If round 1 fails and round 2's mobile-data people are fine, it's per-network. If everyone fails in both rounds, it's global, which is serious.
Dev check: 429s in logs; the IP the throttler sees (log `req.ip`).

**G1.2 OTP for a classroom** (P1)
Setup: 6+ new testers sign up at once on one Wi-Fi.
Expected: everyone gets an OTP. Limits are 3 per 5 min per IP+phone and 300/hour globally, so this should pass. A failure means the limit key or the SMS provider is the bottleneck.

**G1.3 Feedback flood** (P2): everyone submits 2 feedback reports at once. The 5/min limit is per IP, so one Wi-Fi network may refuse some. Expected: they're queued and sent later, not lost.

## G2. Settlement throughput

**G2.1 Ten offline payments at once** (P0)
Setup: 10 senders, each paying 1 receiver ₱1 offline by SMS at the same second (C2).
Expected: all settle. Record the time from "sent" to the confirmation text for each. Settlements go through **one relayer lock**, so they're processed one after another. Expect the last one to be noticeably slower. Report the slowest time.
What it hunts: lock timeouts, queue retries producing failures, relayer sequence-number errors (`isBadSequence`), SMS gateway backlog.
Dev check: all `Settlement` rows SETTLED; no FAILED with sequence or timeout reasons; queue retries in logs.

**G2.2 Many to one** (P0)
Setup: 10 senders all pay the **same** receiver B at once (SMS and internet mixed).
Expected: B receives all 10, B's history lists 10, the total is right, and B gets 10 texts.

**G2.3 One to many, fast** (P1)
Setup: A pays 5 different people offline within 2 minutes. A has spaced texts (rate limit 3/min per sender), so after the 3rd, the rest wait for the outbox.
Expected: all 5 settle eventually. Note which took the internet route.

## G3. Reconnect storm

**G3.1 Everyone back online at once** (P0)
Setup: 10 testers each make 2 offline payments in C2 (texts **not** sent, answering "Yes"), so they settle only via the internet route. On "go", everyone turns data on.
Expected: all 20 settle within ~2-3 minutes. Each phone runs one sync (0-3 s jitter spreads them out). No 429s, no "failed" for payments that should settle.
What it hunts: the jitter being too small for a group; the 120/min limit; the relayer queue under burst load.

**G3.2 Tower drop simulation** (P1): everyone in airplane mode for 5 min, then off together. Same as G3.1 but without pending payments; tests history/balance reads only.

## G4. Races on one account

**G4.1 Two phones spend the same online balance** (P0, A + A2)
On "go", both send ₱(balance − 1) online to different people.
Expected: one succeeds and the other fails cleanly ("not enough balance"). No negative balance; histories agree.

**G4.2 Move and send at once** (P0, A + A2): one moves Online→Offline while the other sends online. Expected: consistent end state.

**G4.3 Change MPIN on one phone while the other signs in** (P1): Expected: the second phone's old session ends or asks for the new MPIN.

## G5. Button-mashing (single tester, high value)

Testers are good at this. Ask them to tap fast and impatiently:
- tap Send/Confirm/Swipe 5× fast (online send, top-up, move, SMS send, feedback submit);
- press Android Back during every processing screen;
- rotate the phone (if allowed) and open the notification shade during processing;
- switch apps during the "Did you send the text?" question;
- type an amount, delete it, paste a long string, paste letters.
Expected: never two payments; never stuck on a spinner with no way out; never a crash.

## G6. Long sessions

- **G6.1 All-day carry** (P1): testers keep the app installed and use it normally for a full day, moving between home, commute (weak signal), and work. At the end, each compares their app balance with what they expect from their own notes. Any mismatch is P0.
- **G6.2 Leave it open** (P2): app open on Home 2 hours on Wi-Fi. Report heat, battery %, any freeze.

## G7. Data volume

- **G7.1 Heavy history** (P2): a tester with 200+ transactions (top up then many ₱1 sends). History scroll, search, date filters, Home load time.
- **G7.2 Many pending** (P1): 15 pending offline payments on one phone. Home stays smooth and the held total is exact.

## Reporting stress results

For group rounds, collect in the tracker: round number, tester, network (Wi-Fi name or "data"), time of action, time of result, outcome, any message shown. The developer lines these up with logs by time. That's why synced clocks matter.
