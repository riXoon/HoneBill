# HoneBill test session: Edge cases

**App version:** check the bottom of Profile, and everyone must have the same one · **Network:** Stellar testnet (no real money) · **Session length:** about 90 minutes

Thank you for helping! Today we're not testing whether HoneBill works when everything goes right. We're trying to **break it**: bad signal, closing the app at the worst moment, tapping too fast, two phones at once. If anything feels off, even if you're not sure it's a bug, tell us. That's exactly what we need.

The money here is test money, so you can't lose anything real.

---

## Before you start

- [ ] HoneBill is installed and you're signed in. Write down the **app version** shown at the bottom of Profile.
- [ ] You have **at least ₱200 in your Online balance** and **at least ₱100 in your Offline balance**. Use **Top Up** (free test money) and **Transfer to Offline Balance** if needed.
- [ ] You have **text load or an active text promo**. Offline payments are sent as a normal SMS.
- [ ] You know your partner's **6-character ID** (Home or Profile; tap it to copy). Capital and small letters matter.
- [ ] Your phone is charged above 50%.
- [ ] **Screen recording** is ready: swipe down twice from the top of the screen → "Screen recorder". Record every card marked Offline or Group.
- [ ] Your **Clock app** is open somewhere so you can note times **with seconds**.
- [ ] You have signed in with your **MPIN** (not the fingerprint) at least once today while online.

## How to make your phone "offline"

We use three kinds of offline. Each card says which one.

| Name | How | Why |
|---|---|---|
| **No data** | Mobile data **OFF**, Wi-Fi **OFF**, Airplane mode **OFF** | No internet, but SMS still works. This is the normal way to pay offline. |
| **Airplane** | Airplane mode **ON** | Nothing works, not even SMS. |
| **Fake Wi-Fi** | Ask another tester to turn on their phone's hotspot **with their mobile data OFF**, then connect to it. | Your phone *thinks* it has internet but nothing loads. This is like bad signal and is where many bugs hide. |

To come back online: turn mobile data or Wi-Fi back on, and Airplane mode off.

## How to report a problem

Copy this, fill it in, and send it in the group chat (or in the app: Profile → Help & Feedback, which works even offline):

```
Card: (e.g. OFF-03)
Your name / phone model / Android version:
App version (bottom of Profile):
Online or offline? (Wi-Fi / mobile data / No data / Airplane / Fake Wi-Fi / weak signal):
What you did:
What you expected:
What happened instead:
Time it happened (with seconds):
Reference code on the receipt (if any):
Screenshots or screen recording attached? yes/no
Can you make it happen again? yes / no / didn't try
```

Also fill in your row in the **tracker spreadsheet**: Pass / Fail / Blocked, plus notes.

---

## Test cards

## Offline payments

### OFF-01 · Basic offline payment by text

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 10 min · **Costs:** ₱10 from A's Offline balance

**Why:** This is the baseline. If this fails, tell us right away before doing other offline cards.

**Before you start:**
- A writes down their Offline balance.
- B is online with HoneBill open on Home and writes down their balance.

**Steps:**
1. A: Go **No data**.
2. A: Send ₱10 to B. When asked "How do you want to send this?", choose **Send Using My Phone**.
3. A: In the messages app, press Send. Note the time.
4. A: Go back to HoneBill. When asked "Did you send the text?", tap **Yes, I sent it**.
5. A: Look at the receipt, History and Home. Screenshot each.
6. B: Wait up to 5 minutes. Watch your texts and your balance.
7. A: Turn mobile data back on and wait 1 minute on Home.

**You should see:**
- A, right after step 4: a receipt with a reference code. The payment is listed as pending in History. The Offline amount you can spend dropped by ₱10.50 (₱10 + ₱0.50 fee).
- B: a text saying A paid ₱10, and B's balance goes up by ₱10.
- A, after step 7: a notice "1 offline payment went through." The payment is no longer pending. It appears once, not twice.

**Report if:**
- B is not paid after 10 minutes, or is paid twice.
- A's History shows the payment twice or as failed.
- Send the reference code, the time from step 3, and screenshots from both phones.

### OFF-02 · The held money adds up exactly

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 15 min · **Costs:** ₱60 from A's Offline balance

**Why:** When you pay offline, the money must be set aside right away so you can't spend it twice.

**Before you start:**
- A's Offline balance is at least ₱100. Write the exact amount down (call it X).

**Steps:**
1. A: Go **No data**.
2. A: Pay B ₱10 offline (Send Using My Phone → send the text → **Yes, I sent it**).
3. A: Pay B ₱20 the same way.
4. A: Pay B ₱30 the same way.
5. A: Start a 4th payment and look at how much the app says you can still spend. Screenshot it.
6. A: Try to send ₱1 **more** than that amount. Screenshot what happens.
7. A: Cancel. Look at Home and screenshot the message about held money.
8. A: Turn mobile data on and wait 2 minutes.

**You should see:**
- After step 4, the amount you can spend is **X minus ₱61.50** (₱60 plus three ₱0.50 fees).
- Step 6 is blocked with a "not enough" message.
- Home says "₱61.50 is held for offline payments that are still waiting to settle."
- After step 8, the held message disappears and all three payments show as done.

**Report if:**
- Any number is off, even by ₱0.50.
- You were able to send more than you had.
- Send screenshots of steps 5, 6 and 7.

### OFF-03 · Say "Not yet", then send again

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 8 min · **Costs:** ₱5 from A's Offline balance

**Why:** If someone changes their mind and tries again, they must only pay once.

**Steps:**
1. A: Go **No data**.
2. A: Send ₱5 to B → Send Using My Phone.
3. A: In the messages app, do **not** press Send. Go back to HoneBill.
4. A: When asked "Did you send the text?", tap **Not yet**.
5. A: Tap **Send Using My Phone** again. This time press Send in the messages app.
6. A: Go back to HoneBill and tap **Yes, I sent it**.
7. B: Wait up to 5 minutes.

**You should see:**
- B is paid ₱5 **once**.
- A's History shows **one** ₱5 payment.

**Report if:**
- B gets ₱10, or two texts about two payments.
- A sees two entries.

### OFF-04 · Send the same text twice

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 8 min · **Costs:** ₱5 from A's Offline balance

**Why:** Texts can be resent by accident. Money must never move twice.

**Steps:**
1. A: Go **No data** and pay B ₱5 offline as normal (send the text, tap **Yes, I sent it**).
2. A: Open the messages app and find the text you just sent.
3. A: Long-press it and **Forward** it to the same number (or copy it and send it again). Note the time.
4. B: Wait 5 minutes.

**You should see:**
- B is paid ₱5 **once**.
- A may get a text that the second one didn't go through. That's fine, as long as no extra money is taken.

**Report if:**
- B is paid twice, or A's balance drops twice.

### OFF-05 · Close the app before answering

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 10 min · **Costs:** ₱5 from A's Offline balance

**Why:** If the phone closes the app at the worst moment, the payment must still go through, only once, and A must eventually see it.

**Steps:**
1. A: Go **No data**.
2. A: Send ₱5 to B → Send Using My Phone → press Send in the messages app. Note the time.
3. A: Do **not** go back to HoneBill. Open Recent apps and **swipe HoneBill away**.
4. B: Wait up to 5 minutes for the text and the money.
5. A: Turn mobile data back on. Open HoneBill, sign in, wait 2 minutes on Home.

**You should see:**
- B is paid ₱5 once.
- A, after step 5: the ₱5 payment appears in History once, as done.

**Report if:**
- A's History never shows the payment, even after pulling down to refresh.
- A's Offline balance doesn't match what A expects.
- Write down whether the app ever told A about this payment.

### OFF-06 · Stay in the messages app for a long time

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 8 min · **Costs:** ₱5 from A's Offline balance

**Why:** HoneBill locks itself after 30 seconds away. We need to know the payment isn't lost when that happens.

**Steps:**
1. A: Go **No data**. Start screen recording.
2. A: Send ₱5 to B → Send Using My Phone.
3. A: In the messages app, **wait 45 seconds** (watch the clock), then press Send.
4. A: Go back to HoneBill. Sign in with your MPIN if asked.
5. A: Answer **Yes, I sent it** if asked.
6. A: Check History and the amount you can spend offline.

**You should see:**
- After signing in, the app still asks "Did you send the text?", **or** the payment is already listed as pending.
- The ₱5.50 is held (the amount you can spend offline dropped).

**Report if:**
- The app never asked, and the payment is **not** in History. This is important: send the screen recording.

### OFF-07 · Sent the text but answered "Not yet"

**Area:** Offline · **Priority:** P1 · **People:** 2 (A sends, B receives) · **Time:** 10 min · **Costs:** ₱5 from A's Offline balance

**Why:** People make mistakes. We want to see what the app shows when the answer is wrong.

**Steps:**
1. A: Go **No data**. Write down how much you can spend offline.
2. A: Send ₱5 to B → Send Using My Phone → **press Send** in the messages app.
3. A: Go back to HoneBill and tap **Not yet** (the wrong answer on purpose).
4. A: Check History and how much you can spend offline. Screenshot both.
5. B: Wait up to 5 minutes.
6. A: Turn mobile data on, wait 2 minutes, then check again.

**You should see:**
- B gets paid ₱5 (the text went out).
- After step 6, A's History shows the ₱5 payment and the balance is right.

**Report if:**
- Write down exactly what A's app showed at step 4 and at step 6 (screenshots). We expect step 4 to show **too much** money available, and we want to see it.

### OFF-08 · Four payments in one minute

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 12 min · **Costs:** ₱4 from A's Offline balance

**Why:** The text number only accepts a few texts per minute from one phone. We want to be sure no payment is lost.

**Steps:**
1. A: Go **No data**.
2. A: Pay B ₱1 offline, **four times, as fast as you can** (all within 1 minute). Note each time.
3. B: Wait 5 minutes. Count how many ₱1 payments arrive.
4. A: Stay offline 5 more minutes, then turn mobile data on and wait 3 minutes.
5. B: Count again.

**You should see:**
- After step 3, B may have only 3 payments. That's expected for now.
- After step 4, B has all 4, each exactly once.

**Report if:**
- B never gets all 4, or gets more than 4.
- A's History doesn't show all 4 as done after step 4.
- Write down whether A's app ever said anything about the 4th payment.

### OFF-09 · Said "Yes" but the text never left

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 10 min · **Costs:** ₱5 from A's Offline balance

**Why:** Sometimes texts fail (no load, no signal). The app should still finish the payment once it's online.

**Steps:**
1. A: Go **No data**.
2. A: Send ₱5 to B → Send Using My Phone.
3. A: In the messages app, **delete the message instead of sending it**.
4. A: Go back to HoneBill and tap **Yes, I sent it**.
5. A: Wait 3 minutes. B checks: no money yet.
6. A: Turn mobile data on. Wait 2 minutes on Home.

**You should see:**
- Nothing reaches B before step 6.
- After step 6, B is paid ₱5 once, and A sees "1 offline payment went through."

**Report if:**
- The payment stays pending for more than 5 minutes after A is online.
- B is never paid, or is paid twice.

### OFF-10 · Wrong ID while offline

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B is the target) · **Time:** 12 min · **Costs:** up to ₱10 from A's Offline balance (should come back)

**Why:** Offline, the app can't check who an ID belongs to. Money must never go to the wrong person.

**Before you start:**
- Write down B's ID exactly, e.g. `aB3xYz`.

**Steps:**
1. A: Go **No data**.
2. A: Send ₱5 to B's ID with the **capital and small letters swapped** (e.g. `Ab3XyZ`). Read any warning, screenshot it, then send.
3. A: Send ₱5 to a made-up ID that probably doesn't exist (e.g. `zz9QQ1`) and send it.
4. A: Turn mobile data on and wait 3 minutes.
5. A: Open each of the two payments in History.

**You should see:**
- Before sending, a warning that the ID could not be checked.
- After step 4, both payments say they **did not go through** and "No money was taken". The held money comes back.
- B is not paid by the wrong-case ID (unless that happens to be someone else's ID, in which case report it right away).

**Report if:**
- Anyone receives money from these payments.
- They stay pending, or the money doesn't come back.

### OFF-11 · Change the text before sending

**Area:** Offline · **Priority:** P1 · **People:** 2 (A sends, B receives) · **Time:** 8 min · **Costs:** ₱5 from A's Offline balance (should come back or go through once)

**Why:** Checks that a changed text can't trick the system.

**Steps:**
1. A: Go **No data**.
2. A: Send ₱5 to B → Send Using My Phone.
3. A: In the messages app, **change the very last character** of the message to something else, then press Send.
4. A: Go back and tap **Yes, I sent it**.
5. A: Turn mobile data on and wait 3 minutes.

**You should see:**
- B is paid **either** ₱5 once **or** nothing, and never a different amount.
- A's History ends up either "went through" or "did not go through. No money was taken." It should match what B saw.

**Report if:**
- B gets a different amount, or is paid twice.
- A's History and B's balance disagree.

### OFF-12 · Wi-Fi that doesn't really work

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) + someone to share a hotspot · **Time:** 10 min · **Costs:** ₱5 from A's Offline balance

**Why:** Bad signal is more common than no signal. The app must not get stuck.

**Steps:**
1. A: Turn mobile data **off**, connect to **Fake Wi-Fi**. Start screen recording.
2. A: Pull down on Home to refresh. Wait 30 seconds. Note what you see.
3. A: Tap Send and type B's ID. Note what happens, and how long it takes.
4. A: Finish the payment any way the app lets you (offline by text if offered).
5. A: Switch to real internet and wait 2 minutes.

**You should see:**
- The app eventually says it can't connect, or offers to send offline. It doesn't spin forever.
- The payment goes through once.

**Report if:**
- Any spinner or loading screen lasts more than 30 seconds with no way out.
- The app crashes or freezes.

### OFF-13 · Signal coming and going

**Area:** Offline · **Priority:** P1 · **People:** 1 · **Time:** 5 min

**Why:** Checks the app stays calm when the connection flickers.

**Steps:**
1. Open Home. Start screen recording.
2. Turn Airplane mode ON then OFF, **5 times**, about 2 seconds apart.
3. Wait 1 minute.
4. Open History.

**You should see:**
- No crash, no pile of error messages.
- History shows no duplicate entries, and the balances look right.

**Report if:**
- Duplicates, wrong balances, crash, or messages that won't go away.

### OFF-14 · Phone restarts with a payment waiting

**Area:** Offline · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 10 min · **Costs:** ₱5 from A's Offline balance

**Why:** A payment must survive the phone restarting.

**Steps:**
1. A: Go **Airplane**. Pay B ₱5 offline: open the text, but it won't send because of airplane mode. Tap **Yes, I sent it** anyway.
2. A: Check that the payment is pending in History.
3. A: **Restart the phone** (hold power → Restart).
4. A: Open HoneBill with Airplane still on and sign in with your MPIN.
5. A: Check History and the held amount. Screenshot.
6. A: Turn Airplane OFF (with data on) and wait 2 minutes.

**You should see:**
- After the restart, the pending payment and the held money are still there.
- After step 6, the payment goes through and B is paid once.

**Report if:**
- The pending payment disappeared after the restart.
- B is never paid.

### OFF-15 · Same account on two phones (offline)

**Area:** Offline · **Priority:** P0 · **People:** A with **two phones** (A1, A2), and B · **Time:** 15 min · **Costs:** ₱5 from A's Offline balance (should come back)

**Why:** Only one phone at a time can pay offline. The other must fail safely.

**Before you start:**
- A is signed in on A1. A2 has HoneBill installed.

**Steps:**
1. A1: Go **No data** and stay that way.
2. A2: With internet, sign in to **the same account** (use your recovery phrase if asked). Stay on Home for 2 minutes.
3. A1 (still offline): Pay B ₱5 offline by text → **Yes, I sent it**. Note the time.
4. Everyone: Wait 5 minutes. Watch A's texts and B's balance.
5. A1: Turn mobile data back on, wait 3 minutes, check History.

**You should see:**
- The A1 payment **does not go through**. A gets a text saying so, and that no money was taken. B is not paid.
- After step 5, A1 shows the payment as failed with a reason, and the held money comes back.

**Report if:**
- B gets paid from A1 (tell us which phone was online most recently).
- No money comes back, or the payment stays pending.
- The reason shown is confusing (send a screenshot).

### OFF-16 · Two phones, one Offline balance

**Area:** Offline · **Priority:** P0 · **People:** A with two phones (A1, A2), and B · **Time:** 12 min · **Costs:** about ₱50 from A's Offline balance

**Why:** Money must never go below zero, even if two phones use it.

**Steps:**
1. A1: Pay B ₱50 offline by text in **No data**, and tap **Yes, I sent it**. Keep A1 offline.
2. A2 (online): Right away, tap **Transfer to Online Balance** and move **all** of the Offline balance to Online.
3. Wait 5 minutes.
4. A1: Turn data on and wait 3 minutes.

**You should see:**
- Either the ₱50 payment goes through and the move from A2 was smaller, **or** the payment fails with "No money was taken".
- No balance is ever negative. A1 and A2 show the same numbers in the end.

**Report if:**
- Both went through in full (B paid ₱50 **and** the full amount moved).
- The phones show different balances after 5 minutes online.

### OFF-17 · Wrong date on the phone

**Area:** Offline · **Priority:** P1 · **People:** 2 (A sends, B receives) · **Time:** 10 min · **Costs:** ₱5 from A's Offline balance

**Why:** Phones often have the wrong time.

**Steps:**
1. A: Settings → Date & time → turn off automatic time → set the date **2 days ahead**.
2. A: Go **No data** and pay B ₱5 offline as normal.
3. A: Look at the date on the receipt and in History. Screenshot.
4. A: Turn automatic time back ON. Turn data on and wait 2 minutes.

**You should see:**
- B is paid ₱5 once.
- History ends up with one entry, with a sensible date.

**Report if:**
- The payment fails, shows twice, or the date is very wrong after step 4.

## Signing in and locking

### SIGN-01 · MPIN without internet, first time

**Area:** Sign-in · **Priority:** P0 · **People:** 1 · **Time:** 5 min

**Why:** People often open the app with no signal. They must be able to get in.

**Steps:**
1. Sign in online with your MPIN. Then go to Profile and sign out (or wait for the app to lock).
2. Go **Airplane**.
3. Open HoneBill and sign in with your MPIN.
4. Look at Home.

**You should see:**
- You get in. Home shows your last balances with a note that you're offline and when it last updated.

**Report if:**
- The correct MPIN is refused.
- Home is blank or shows ₱0 when you know you have money.
- Extra (if your phone has a fingerprint set up): try the fingerprint offline too and note the result.

### SIGN-02 · Wrong MPIN 5 times offline

**Area:** Sign-in · **Priority:** P0 · **People:** 1 · **Time:** 20 min (mostly waiting; do other cards meanwhile on a different phone, or do this last)

**Why:** The lock must hold even if someone restarts the phone.

**Steps:**
1. Go **Airplane**. On the sign-in screen, enter a **wrong** MPIN 5 times. Screenshot the message.
2. Restart the phone. Open HoneBill and try the **correct** MPIN.
3. Write down what it says and how long it says to wait.
4. After the wait (about 15 minutes), try the correct MPIN again.

**You should see:**
- After 5 wrong tries: locked, with a wait time of about 15 minutes.
- Still locked after the restart.
- After the wait, the correct MPIN works.

**Report if:**
- It unlocks early, or never unlocks, or the restart clears the lock.

### SIGN-03 · App goes to the background during a payment

**Area:** Sign-in · **Priority:** P1 · **People:** 2 (A sends, B receives) · **Time:** 5 min · **Costs:** ₱5 from A's Online balance

**Why:** The app locks after 30 seconds in the background. It shouldn't break a payment that's in progress.

**Steps:**
1. A (online): Send B ₱5 online. As soon as you confirm, press the **Home** button.
2. A: Wait **40 seconds**, then reopen HoneBill.
3. A: Sign in if asked. Check History.
4. Separately: leave HoneBill in the background for **20 seconds** and reopen. Then for **40 seconds** and reopen.

**You should see:**
- The ₱5 payment is completed once, and shown in History.
- Step 4: no lock after 20 s; asks for the MPIN after 40 s.

**Report if:**
- The payment is lost, doubled, or stuck.
- The lock timing is clearly different.

### SIGN-04 · Switch accounts with a payment waiting

**Area:** Sign-in · **Priority:** P0 · **People:** 2 (A's phone, plus B's login details) · **Time:** 15 min · **Costs:** ₱5 from A's Offline balance

**Why:** Shared phones happen. One person's waiting payment must not leak to, or be lost because of, another account.

**Steps:**
1. A: Go **Airplane**. Pay B ₱5 offline, open the text (it won't send), tap **Yes, I sent it**. It is pending.
2. A: Turn Airplane off, and **sign out** from Profile.
3. On A's phone, sign in as **B** (B types their own details). Look at Home and History.
4. Sign out B. Sign A back in. Wait 2 minutes online.

**You should see:**
- At step 3, B sees **none** of A's payments or balances.
- At step 4, A's ₱5 payment goes through, and B is paid once.

**Report if:**
- B can see anything of A's.
- A's waiting payment is gone, or never goes through.

## Online payments and moving money

### SEND-01 · Double tap to pay

**Area:** Online · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 5 min · **Costs:** ₱5 from A's Online balance

**Why:** Impatient fingers must never pay twice.

**Steps:**
1. A (online): Send B ₱5.
2. A: On the last confirm step, tap or swipe **as fast as you can, several times**.
3. A and B: Check History after 1 minute.

**You should see:**
- One ₱5 payment only.

**Report if:**
- Two payments, or a stuck screen. Try the same with **Top Up** and **Transfer to Offline Balance** and report those too.

### SEND-02 · Lose internet right after paying

**Area:** Online · **Priority:** P0 · **People:** 2 (A sends, B receives) · **Time:** 8 min · **Costs:** ₱5 from A's Online balance

**Why:** The connection often drops at the worst moment.

**Steps:**
1. A (online): Send B ₱5. **The moment** you confirm, turn on Airplane mode.
2. A: Watch the screen for 30 seconds. Screenshot what it says.
3. A: Turn Airplane off. Wait 2 minutes. Check History.
4. B: Check History.

**You should see:**
- A clear message (sent, failed, or still checking), not an endless spinner.
- In the end: B was paid **at most once**, and A's History matches B's.

**Report if:**
- The two Histories disagree, or A was charged without B being paid.
- If the app said "failed", do **not** retry until you've checked B's History. Then tell us what happened.

### SEND-03 · Close the app while moving money

**Area:** Online · **Priority:** P0 · **People:** 1 · **Time:** 5 min · **Costs:** ₱20 moved (not spent)

**Why:** Moving money between your Online and Offline balances must finish correctly even if the app closes.

**Steps:**
1. Write down both balances.
2. Tap **Transfer to Offline Balance**, move ₱20.
3. While it is still working, **swipe the app away** from Recent apps.
4. Reopen and sign in. Wait 1 minute. Write down both balances and check History.

**You should see:**
- Either the ₱20 moved (Online −20, Offline +20, one History entry) or it didn't move at all.
- Never: money gone from one side without arriving on the other.

**Report if:**
- The totals don't add up, or the move shows twice.

## Your phone

### PHONE-01 · Big text, small screen

**Area:** Phone · **Priority:** P2 · **People:** 1 · **Time:** 10 min

**Why:** Many people use large text.

**Steps:**
1. Phone Settings → Display → set **Font size** and **Display size** to the largest.
2. Go through: sign-in, Home, Send (every step), Receive, History, a transaction's details, Profile, Help & Feedback.
3. Switch the language to Filipino (Profile) and go through them again.

**You should see:**
- Everything readable and every button reachable (scrolling is fine).

**Report if:**
- Text cut off or overlapping, a button you can't reach, or English left on a Filipino screen. Screenshot each one.

### PHONE-02 · Phone kills the app in the background

**Area:** Phone · **Priority:** P0 · **People:** 1 · **Time:** 8 min · **Costs:** ₱5 from Offline balance

**Why:** Cheap phones close apps to save memory. Nothing important may be lost.

**Steps:**
1. Make an offline payment in **Airplane** (it stays pending).
2. Leave HoneBill. Open the camera and record a 1-minute video, then open 3 other heavy apps (Facebook, TikTok, a game).
3. Come back to HoneBill.

**You should see:**
- HoneBill asks for your MPIN or shows Home. The pending payment and held money are still there.

**Report if:**
- A crash, a blank screen, or the pending payment is gone.
- Also tell us your phone model and how much RAM it has (Settings → About phone).

## Group tests (do together, with a countdown)

The organiser counts down "3, 2, 1, GO". Everyone does the step on GO and writes down the time and what happened.

### GRP-01 · Everyone refreshes on the same Wi-Fi

**Area:** Group · **Priority:** P0 · **People:** Everyone (6+) · **Time:** 10 min

**Why:** We think many people on one Wi-Fi might block each other. Let's find out.

**Steps:**
1. Everyone: connect to the **same Wi-Fi**, open Home.
2. On GO: pull down to refresh **5 times in 20 seconds**.
3. Everyone: write down whether you saw "Too many requests" or an error.
4. Half the group switches to **mobile data**. Repeat from step 2.

**You should see:**
- Everyone gets fresh balances, with no "Too many requests".

**Report if:**
- Anyone sees "Too many requests" or an error. Note whether you were on Wi-Fi or mobile data, and the time.

### GRP-02 · Ten offline payments at the same second

**Area:** Group · **Priority:** P0 · **People:** Everyone, in pairs · **Time:** 15 min · **Costs:** ₱1 each from the senders' Offline balance

**Why:** Tests what happens when many offline payments arrive together.

**Steps:**
1. Senders: go **No data**, and get ready to pay your partner ₱1 by text (stop just before pressing Send in the messages app).
2. On GO: press Send, go back and tap **Yes, I sent it**. Write down the time.
3. Receivers: write down the time your money arrives.
4. Wait 10 minutes. Then senders turn data on.

**You should see:**
- Every receiver gets ₱1, once. Some may take longer than others; note how long.

**Report if:**
- Anyone isn't paid after 10 minutes, or is paid twice, or sees "did not go through".

### GRP-03 · Everyone comes back online at once

**Area:** Group · **Priority:** P0 · **People:** Everyone, in pairs · **Time:** 15 min · **Costs:** ₱2 each from the senders' Offline balance

**Why:** Like a cell tower coming back after an outage.

**Steps:**
1. Senders: go **No data**. Make **2** offline payments of ₱1 to your partner, but in the messages app **delete** the texts instead of sending. Tap **Yes, I sent it** each time.
2. Everyone: check that the payments are pending.
3. On GO: senders turn mobile data ON.
4. Everyone: note the time each payment shows as done.

**You should see:**
- All payments go through within about 3 minutes, each once.

**Report if:**
- Any payment is still pending after 5 minutes, failed, or doubled. Any "Too many requests".

### GRP-04 · Two phones spend the same money at once

**Area:** Group · **Priority:** P0 · **People:** A with two phones (A1, A2), B and C · **Time:** 8 min · **Costs:** almost all of A's Online balance

**Why:** The same money must never be spent twice.

**Steps:**
1. A1 and A2 are both signed in to A's account, online. Write down A's Online balance (call it X).
2. A1 gets ready to pay B (X − 1), and A2 gets ready to pay C (X − 1). Stop on the final confirm.
3. On GO: both confirm at the same time.
4. Wait 1 minute. Everyone checks History.

**You should see:**
- Only **one** payment goes through. The other says there isn't enough money.
- A's balance is never negative.

**Report if:**
- Both went through, or both phones show different balances after 2 minutes.

---

## Your assignments

Pair up: **A** and **B** swap roles halfway, so each person tries both sides.

| Round | Pair 1 | Pair 2 | Pair 3 |
|---|---|---|---|
| 1 (20 min) | OFF-01, OFF-03 | OFF-01, OFF-04 | OFF-01, OFF-09 |
| 2 (20 min) | OFF-02, OFF-05 | OFF-06, OFF-07 | OFF-08, OFF-10 |
| 3 (20 min) | OFF-12, OFF-13, SEND-01 | OFF-14, SEND-02, SEND-03 | OFF-11, OFF-17, SIGN-03 |
| 4 (15 min) | SIGN-01, SIGN-04 | PHONE-01, PHONE-02 | OFF-15, OFF-16 (needs a 2nd phone) |
| 5 (15 min, everyone) | GRP-01 → GRP-02 → GRP-03 → GRP-04 | | |

Start **SIGN-02** on any spare phone at the beginning; it needs a 15-minute wait. Anyone who finishes early: pick any card not yet done by your pair.
