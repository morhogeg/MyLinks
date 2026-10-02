# Machina on X: the launch campaign

> The launch campaign for X. Two accounts, one story. **`@machinaapp`** (the
> brand) posts 32 times over six weeks. **The founder's own account** posts 6
> times and carries the reach a brand-new account doesn't have yet. Day 1 is App
> Store launch day. English only.
>
> **Reviewed 2026-10-02** against `main` (build 1344): every claim was checked in
> the code, and every post was rewritten or re-confirmed. §0 lists what changed
> and why. Anything that needs a real screenshot, a real number or a real user is
> marked `[fill]` and must never be invented.
>
> **House rules every post keeps:**
> - **The name** is `Machina`, never "Machina AI".
> - **Banned words:** "second brain", "AI" and "AI-powered" (the one exception is
>   F4, the founder's post about dropping "AI" from the name). Never call Machina
>   a bookmark manager, and never write "share sheet" (say "tap Share").
> - **The tagline** is **Everything you save, finally useful.** Use it verbatim,
>   with the comma and the period: in the bio, in T1 and in T32.
> - **No em dashes,** no hashtags, no emoji, no exclamation marks. One "finally"
>   per post.
> - **The hero is one place that holds everything you save** (BRANDING D-7). Ask
>   is the payoff, not the lead.
> - **Never imply a Pro feature is free.** When a post shows one, its first comment
>   says so.

---

## 0. What this review changed (2026-10-02)

**Claims that had stopped being true**, all fixed:
- **Ask citations.** The draft said "a citation on every line" in T1, T6, T18 and
  T21, and T18 said a tap opens "the passage". The app actually lists the saves
  an answer used as cards under the answer, and a tap opens that card
  (`AskBrain.tsx`, `onOpenLink`). The posts now say exactly that.
- **"Capture stays free"** (old T23). The free plan has refused the 101st save of
  the month since 2026-09-02 (`functions/quota.py`, free 100 / Pro 1000). The
  post now states the real plan: a 14-day Pro trial, then 100 saves and 20
  questions a month.
- **Pro features next to "Free".** The Sunday recap is a locked teaser on free,
  and the Daily Brew and YouTube key moments are Pro-only (`digest_service.py`,
  `_video_ingest_allowed`). The old T5 ended "Free on iPhone and web" right after
  describing the recap. Every post that shows a Pro feature now drops "free" and
  says "Pro, free for your first 14 days" in its first comment.
- **The browser extension isn't public** (`extension/README.md`: "not in the Chrome
  Web Store yet"), so the old T8 comment pointing people to it is gone.
- **Two find-and-replace slips from the handle rename:** the support address read
  `support@machinaapp.app` (it's `support@mymachina.app`), and the account
  section said to "park `@machinaapp`" (the handle you already own).
- **Smaller fixes.** Insights moved into Settings, so T13 now covers "Do this".
  The quote "Three of your saves connect to Network Effects" doesn't exist in the
  app, so it's gone. The share extension's real line is "Saved ✓ · Making your
  card", not "Saved to Machina". T1.2 said "files a clean card" and then "No
  filing". T3's "less time than it takes to close the app" was never measured.

**What it adds:**
- **The founder track (§4).** A new account with no followers gets almost no
  distribution on X; people follow people.
- **Posts for what shipped since September:** import (T5), Do this (T14), named
  graph clusters (T15), Ask on a single collection (T21), shared answers (T28)
  and the Daily Brew (T30).
- **A Day-1 checklist (§2)** and an attachment plan (§7) that uses the videos and
  capture kit that now exist.

**The voice, tightened.** The old rule made every post restate "one place for
everything you save, from any app", so the timeline read like ad copy by week
two. Every post still names Machina, but the full description now appears only
where a cold reader is likeliest to land: T1, T2, the capture posts and the close.

---

## 1. The strategy in one page

**What the campaign has to do.** Turn a launch into a habit of following. A
launch post gets one day of attention; a story gets six weeks of it. So the
posts are one argument, told in acts, with the product demonstrating each step
instead of describing it.

**The argument.**
1. You save things everywhere, and then you never see them again. The problem is
   fragmentation, not clutter (the founder letter, the film's act one).
2. Machina is one place for all of it, from every app, in one tap (capture, the hero).
3. Every save is read, filed and connected on its own (what no folder does).
4. It comes back: a to-do when a save calls for one, a Sunday read, a reminder.
5. And when you need something, you just ask. The answer comes only from what
   you saved, with the sources under it (recall, the payoff).
6. You can trust it: your data, free to start, honest when it doesn't know.

**Two accounts, two jobs.**

| | `@machinaapp` (brand) | The founder's account |
|---|---|---|
| Job | Product proof: what each part does, shown | Reach and story: why it exists, how it was built, what was learned |
| Voice | Plain, specific, unhurried. Machina is the subject. | First person. Mor's own words (the founder letter in Settings → The story behind Machina is the source) |
| Posts | 32 over six weeks (T1 to T32) | 6 (F1 to F6) plus replies, and quote-posts of brand posts with one personal line |
| Pinned | T1 | F2 |

The founder account goes first in reach on launch day: F2 is the post people
share, and T1 is where they land when they tap through to `@machinaapp`.

**The shape.**

| Week | Arc | Brand posts |
|---|---|---|
| 1 | **Launch**: the whole argument, one beat a day | T1 to T8 |
| 2 | **Saves from anywhere** (series: the article, the video, the screenshots), then Revisit | T9 to T12 |
| 3 | **What a card knows** (series: the summary, the next step, the connections), then Find and a real recap | T13 to T17 |
| 4 | **Ask** (series: only your saves, the sources, the honest no), then collections and the community question | T18 to T22 |
| 5 | **Trust** (series: yours, free to start, everywhere), then Hebrew and the monthly post | T23 to T27 |
| 6 | **The bigger idea**: sharing, the belief, the Daily Brew, thirty days, the close | T28 to T32 |

**Cadence.** One post a day in launch week. After that, a three-day series
(Tuesday to Thursday), a Saturday post and a Sunday post. Sundays belong to the
recap, posted on the day the app writes it, so the account's rhythm and the
app's rhythm are the same. Never two feature posts on the same day from the
same account.

**Voice.** Plain, specific, confident, unhurried. Short sentences. Concrete nouns
(a forty-minute talk, a friend's text) rather than categories ("content"). The
product is never called smart, magical or powerful: the post shows what it did and
lets the reader supply the adjective.

**Link rule.** X shows posts that carry an outbound link to fewer people. The App
Store link lives in the bio, the pinned posts and the **first comment**. Only
three brand posts carry it in the body (T1, T31, T32), plus the founder's F2.

**Media rule.** Every post ships with one image or one clip, except the three
text-only posts (T22, T29 and the founder's F4). Clips run under 30 seconds,
vertical or square, with captions burned in. Stills are light mode, at 2x, with
the status bar at 9:41. **What's real:** clips and stills from the capture kit
show the real app on a demo account, and that's fine for showing what a screen
does. Anything presented as a real person's library, a real answer, a real recap
or a real number must be real, used with written permission.

---

## 2. Before Day 1

### The accounts

**Brand: `@machinaapp`** (registered by the owner, 2026-09-02). People see the
display name `Machina`; the handle is only the address. The handle and the
domain differ, so the website field carries `mymachina.app`. `@mymachina` was
the first choice: if it ever frees up, register and park it so a stranger can't
take it (a handle can be switched later without losing followers).

| Field | Value |
|---|---|
| Display name | `Machina` |
| Bio (160 max) | `Everything you save, finally useful. Share from any app, and Machina reads it, files it, connects it, and brings it back when you need it.` |
| Website | `mymachina.app` |
| Location | leave blank |
| Profile picture | the app icon (the citation mark on the graphite ground), 400x400 |
| Header (1500x500) | the launch film's "five platforms gathering into one point" still, light grade, wordmark bottom right |
| Category | Professional account, "Software company" or "App" |
| Pinned | T1, within a minute of posting |

**Founder account.** Add one line to the existing bio: `Building @machinaapp`.
Pin F2 on launch day. X Premium on the founder account is worth more than on
the brand account: Premium replies rank higher, and replies are where launch-week
reach comes from.

**Warm up both accounts now.** No posts from `@machinaapp` before T1. Until then,
3 to 5 thoughtful replies a day, from both accounts, to people in personal
knowledge, productivity, indie iOS and design. Follow 150 to 200 of them. An
account that arrives on Day 1 with a few weeks of age and a real following graph
gets shown; a fresh one gets throttled.

### Day 1 is a Tuesday when all of these are true

1. **The App Store listing reads "Ready for Sale",** and the link opens on a phone
   that isn't signed into the developer account. (Open before submission:
   `SOURCE_OF_TRUTH.md` §4 task 9, the demo account, and task 11, the on-device
   sweep.)
2. **The Gemini spend cap is raised** (`SOURCE_OF_TRUTH.md` §4 item 5b, still open).
   At the current cap the app stops working for everyone at about 70 active
   users, and a launch that goes well is exactly the day that happens.
3. **Product Hunt is scheduled** for the same Tuesday, 12:01 AM Pacific.
4. **Every launch-week attachment is rendered** and in a folder (§7), along with
   the Day 1 to 8 copy, scheduled.
5. **You've decided the pricing line.** T24 says "100 saves and 20 questions a
   month" on free because that's what `functions/quota.py` enforces. But
   `SOURCE_OF_TRUTH.md` §7.1 also says "Capture is never gated". The code and
   the principle disagree, and the copy follows the code. If you change the cap,
   change T24.

Tuesday, because Product Hunt and X both peak Tuesday to Thursday, and because
it puts the first Sunday recap post (T6) inside launch week. Avoid the week of
a US holiday or an Apple event.

**Posting time.** 9:00 AM Eastern on weekdays (16:00 Israel, 06:00 Pacific) and
10:00 AM Eastern on weekends. Founder posts go up at 12:00 PM Eastern, so the two
accounts don't compete for the same hour. Schedule everything in advance.
A first comment is just a reply to your own post, so schedule each post and its
first comment together as a two-post thread (X's scheduler and tools like
Typefully both do this). Never post live from the phone on launch day, when
replies need all the attention.

### Owner-only fills before each post goes out

| Where | What |
|---|---|
| T1, T2, T31, T32, F2 | The App Store URL (`apps.apple.com/...`) |
| T8 | Five real first saves from launch week, with permission (or "the founder's first five") |
| T17 | A real This week in Machina, shared with permission |
| T27 | Three real questions from T22's replies, with answer excerpts |
| T28 | A real shared card URL (`mymachina.app/s?id=...`) |
| T31 | Real thirty-day numbers from `analytics_events` and the workspace count. Round down; never inflate. |
| F1 | The real launch date (post only once Apple has approved the build) |
| F6 | Two or three real things you learned in the first month |

---

## 3. The brand posts (`@machinaapp`)

Format: ID, day, weekday, then the post. IDs are internal and never appear in a
post. Threads show one tweet per block, separated by `~`.

Under each post:
- **Attach** is the one image or clip that goes with it (sources in §7).
- **First comment** is your own reply under the post, made right after it goes up.
  It holds the App Store link and answers the obvious next question. "none"
  means post the tweet and its attachment, and nothing else.

Every tweet was counted by script with X's own rules (a link counts as 23
characters) and is under 280. Text you fill in later counts too, so keep the
finished post under 280.

### Week 1: Launch. One beat of the argument per day.

#### T1 · Day 1 · Tuesday · the launch thread (pin it)

```tweet
A post on Instagram. A thread on here. A talk on YouTube. A screenshot of a friend's text.

You saved all of it. Where is it now?

Machina is one place for everything you save, from any app. It reads every save and gives it back when you need it.

Out today on iPhone.
~
Tap Share in any app and pick Machina. That's the whole save.

Machina reads the page, watches the video, or pulls the text from the screenshot, then makes a card: a summary, the key points, tags and a category.

No folders to make. The card finishes on its own.
~
Every new save is checked against everything you already kept.

Related saves show up on the card itself, and the graph draws your whole library as one map, each cluster named for what it's about.

Things you saved months apart turn out to be about the same idea.
~
Later, just ask Machina.

"What did I save about sleep and focus?"

The answer is written only from your saves, and the saves it used sit right under it. Tap one and you're back at the source.

That's the part a folder can never do.
~
Machina. One place for everything you save, from any app. iPhone and web, free to start.

Everything you save, finally useful.

apps.apple.com/[fill]
```

- **Attach:** T1.1 gets a 20-second vertical cut (the highlight reel's opening
  or ad 1, §7). T1.2 to T1.4 get one still each: a finished card, the graph with
  its cluster names, and an Ask answer with its sources. T1.5 gets the
  film's endcard.
- **First comment, under T1.5:** `Web: mymachina.app`
- **Same day, elsewhere:** the founder posts F2 at noon Eastern and quote-posts T1
  that evening. Product Hunt goes live at 12:01 AM PT. LinkedIn gets F2's text
  as one post with the film. TestFlight testers get the email in §8.

#### T2 · Day 2 · Wednesday · the problem

```tweet
Where did you save it?

Instagram, maybe. Or that thread you liked. Or a screenshot from three weeks ago, somewhere under four hundred others.

Saving was never the hard part. Finding it again is.

Machina is one place for all of it, from every app.
```

- **Attach:** the film's act-one still: five platform panels drifting apart and
  fading into the paper.
- **First comment:** `Free to start, on iPhone and the web: apps.apple.com/[fill]`

#### T3 · Day 3 · Thursday · capture, shown

```tweet
Share. Tap Machina. Keep scrolling.

That's a save. The screen says "Saved ✓ · Making your card", and it means it: the save is safe, and the card finishes on its own while you get on with your day.

Works anywhere there's a Share button.
```

- **Attach:** a 12-second recording on your iPhone: an Instagram post, Share,
  Machina, the extension's progress and "Saved ✓ · Making your card", then the
  finished card in the feed. Real device, real post, no cuts. This is the one
  clip the capture kit can't make, because the share extension is native.
- **First comment:** `Safari, YouTube, Instagram, X, Photos, WhatsApp. If it has a Share button, it saves to Machina.`

#### T4 · Day 4 · Friday · anatomy of a card

```tweet
One tap on Share. This is what comes back in Machina:

A summary of the whole piece.
The key points.
A category and tags.
Reading time.
A next step, when there's one to take.
Related saves, found on their own.

Nobody typed any of it.
```

- **Attach:** one annotated card (A4): six thin callouts in the app's own type.
  Reused on Product Hunt and the App Store.
- **First comment:** none. Let the image work.

#### T5 · Day 5 · Saturday · bring what you already saved

```tweet
Years of saves somewhere else? Bring them to Machina.

Import a bookmarks file from any browser, or an export from Pocket and other read-later apps. Folders become tags, and every link is read and filed like a new save.

Settings, then Import.
```

- **Attach:** the import sheet's count line ("N new links, M already saved"), then
  the feed filling with cards.
- **First comment:** `Each imported card keeps the date you first saved it. The free plan imports up to 500 links.`

#### T6 · Day 6 · Sunday · the Sunday ritual

```tweet
Sunday. Machina writes you a short read on everything you saved this week: This week in Machina.

The themes. The one save worth rereading. A question you didn't know you were circling.

Written only from your own saves.
```

- **Attach:** a This week in Machina screenshot. Use a real one with permission
  (`[fill]`), or the capture kit's demo recap if it's clearly a demo.
- **First comment:** `It arrives Sunday, at the hour you choose. It's part of Machina Pro, which is free for your first 14 days.`

#### T7 · Day 7 · Monday · the payoff

```tweet
You saved eleven things about sleep this year. Remember what any of them said?

If they're in Machina, just ask. It answers from your saves alone and shows you exactly which ones it used.

Tap one and you're back at the source.
```

- **Attach:** a 15-second clip: the question typed, the answer streaming in, a
  source tapped, its card opening (from the Ask clip or ad 2, §7).
- **First comment:** `Ask doesn't search the web. If nothing you saved covers it, Machina says so.`

#### T8 · Day 8 · Tuesday · week one

```tweet
One week of Machina on the App Store.

What people saved first: [fill: five real, varied examples from launch week, with permission].

Every one of those is now a card: read, filed, and ready when its owner asks.

What did you save first?
```

- **Attach:** a 3x2 grid of six real cards (blurred where needed).
- **First comment:** `Thank you for week one. For anyone arriving late: apps.apple.com/[fill]`
- **Note:** the examples must be real and specific (a talk on Rust, an apartment
  listing, a thread on salary negotiation is the register). If permission is
  thin, use your own first five and say "the founder's first five".

### Week 2: Saves from anywhere. A three-day series, then Revisit.

Each part opens with the series name and its number, so the three read as
chapters and the timeline shows the shape.

#### T9 · Day 9 · Wednesday · 1/3: the article

```tweet
Machina saves from anywhere, 1/3: the article.

Share from Safari, or any browser. Machina reads the full page, not the preview, and writes the summary from what it actually says.

Long or short, English or Hebrew, it gets read in full.
```

- **Attach:** a split image: the article page on the left, the finished card on the
  right, with the same headline visible in both.
- **First comment:** `On a laptop? Paste the link at mymachina.app. Same library as your phone.`

#### T10 · Day 10 · Thursday · 2/3: the video

```tweet
Machina saves from anywhere, 2/3: the video.

Share a YouTube link. Machina watches it and gives you the summary, the key points, and the key moments, each with its timestamp.

Tap a timestamp and the video opens right at that moment.
```

- **Attach:** the card's Key moments with timestamps showing. The SAVE clip's
  YouTube card is a real output copied from your phone, and ad 1 is built
  around it.
- **First comment:** `Key moments are part of Machina Pro, free for your first 14 days. On the free plan, a video is filed from its title and description.`

#### T11 · Day 11 · Friday · 3/3: the screenshots

```tweet
Machina saves from anywhere, 3/3: the screenshots.

A carousel you don't want to lose? Share up to five screenshots to Machina at once.

They become one card, in order, read as one piece, including every word inside the images.
```

- **Attach:** a 10-second clip: screenshots picked, shared, the "Reading 3
  screenshots…" card in the feed, then the finished card with the screenshots on top.
- **First comment:** `Screenshots are how most people actually save things. In Machina they're a first-class save, not an attachment.`

#### T12 · Day 13 · Sunday · it comes back to you

```tweet
Saving is the easy half.

Machina's Revisit tab brings things back: the reminders you set, the to-dos your saves turned into, and the Sunday read on your week.

Your saves come back when you want them, not when you happen to remember.
```

- **Attach:** the Revisit tab (reminders due, Do this, the This week in Machina
  banner), from the REVISIT clip or ad 3.
- **First comment:** `A reminder can come back three times, further apart each time, so it sticks. The Daily Brew and the Sunday read are part of Pro, free for your first 14 days.`

### Week 3: What a card knows. A three-day series, then Find and a real recap.

#### T13 · Day 15 · Tuesday · 1/3: the summary

```tweet
What a Machina card knows, 1/3: the summary.

Not the first paragraph. Not the site's description. Machina reads the whole piece and writes what it says, with the key points underneath.

Writing a note instead? Your words stay exactly as you wrote them.
```

- **Attach:** two cards side by side: an article card with its summary and key
  points, and a note card showing your words verbatim with "Machina's read" under them.
- **First comment:** `On a note, the summary waits until you ask for it: one tap on "Summarize with Machina".`

#### T14 · Day 16 · Wednesday · 2/3: the next step

```tweet
What a Machina card knows, 2/3: the next step.

When a save calls for action, Machina writes the step for you: one sentence, one thing to do.

They collect in Revisit, under Do this. Tick one off, or swipe it away if it isn't for you.
```

- **Attach:** a 6-second clip of the Do this list: a task ticked (the ring fills,
  the task strikes, the row folds). Ad 3 has exactly this.
- **First comment:** none.

#### T15 · Day 17 · Thursday · 3/3: the connections

```tweet
What a Machina card knows, 3/3: the connections.

When a card lands, Machina checks it against everything you've kept. Related saves appear on the card itself.

Open the graph and your library is one map, its clusters named for what they're about.
```

- **Attach:** a 12-second clip: a card's related row, then the graph with its
  cluster chips, one tapped (from the highlight reel's Connect beat, re-shot on
  today's graph).
- **First comment:** `Folders hold things. Machina notices how they connect.`

#### T16 · Day 19 · Saturday · find it the way you remember it

```tweet
Type what you remember, not what it was called.

"that talk about putting things off" finds Inside the mind of a master procrastinator. Not one word in common.

Machina searches everything you've saved by what it's about, in English or Hebrew, however you saved it.
```

- **Attach:** a 6-second clip: the query typed, one card returned.
- **Note:** before posting, run this exact query on a real account that has the
  talk saved. If it isn't the first result, use a query that is, and change the
  post to match. The capture kit's search answer is scripted, so it proves nothing here.

#### T17 · Day 20 · Sunday · a real recap

```tweet
This week in Machina, from one real library, shared with permission.

The themes. One save worth rereading. One open question.

Written every Sunday from that person's own saves alone. Nobody else's week looks like this one.
```

- **Attach:** the full recap screenshot `[fill]`. Use a tester's library or your
  own. Pick a week that needs no blurring.
- **First comment:** `Machina writes one every Sunday, at the hour you choose. Part of Pro, free for your first 14 days.`

### Week 4: Ask. A three-day series, then collections and the community.

#### T18 · Day 22 · Tuesday · 1/3: only your saves

```tweet
Ask Machina, 1/3: only your saves.

Ask a question and Machina doesn't search the web. Answers come only from what you've saved, with sources you can open.

The answer is yours because the sources are.
```

- **Attach:** the Ask screen with a question, a short answer and its sources.
- **First comment:** none.

#### T19 · Day 23 · Wednesday · 2/3: the sources

```tweet
Ask Machina, 2/3: the sources.

Under every answer sit the saves it came from. Tap one and the card opens: the summary, the key points, the original link.

Don't take the answer's word for it. Check it.
```

- **Attach:** a 10-second clip: a source tapped, its card opening.
- **First comment:** none.

#### T20 · Day 24 · Thursday · 3/3: the honest no

```tweet
Ask Machina, 3/3: the honest no.

Ask about something you never saved, and Machina says so:

"I couldn't find anything in your library about that yet."

An answer that admits the gap beats one that only sounds right.
```

- **Attach:** a screenshot of exactly that reply. The quote is the app's real string
  (`functions/ai_service.py`, `_EMPTY_LIBRARY_ANSWER_EN`); never paraphrase it.
- **First comment:** `The "yet" is the point. Save something on it, and ask again.`
- **Same day:** the founder's F5 quote-posts this.

#### T21 · Day 26 · Saturday · collections

```tweet
Collections in Machina, for what belongs together. A trip. A renovation. A course.

Ask a question of just that collection. Share it as a page. Or keep it private, behind a PIN only you know.
```

- **Attach:** a collection's header with "Ask about this", and one PIN-locked
  collection in the gallery.
- **First comment:** none.

#### T22 · Day 27 · Sunday · the community question (text only)

```tweet
If you could ask one question across everything you've ever saved, what would it be?

Reply with it. Next Sunday: the best ones, with the answers Machina gave from real libraries, shared with permission.
```

- **Attach:** none. This post is a conversation.
- **First comment:** none. Reply to every answer, within the hour.
- **Follow-through:** the best replies feed T27.

### Week 5: Trust. A three-day series, then Hebrew and the month.

#### T23 · Day 29 · Tuesday · 1/3: yours

```tweet
Trust Machina, 1/3: yours.

No ads. No tracking. Nothing sold. Your saves are never used to train models.

Export everything, any time. Delete your account from inside the app, and it's gone.
```

- **Attach:** Settings, showing "Export my data" and the account deletion row.
- **First comment:** `Machina reads your saves with Google's Gemini on its paid tier, whose terms keep your content out of training. The full policy, in plain language: mymachina.app/privacy`

#### T24 · Day 30 · Wednesday · 2/3: free to start

```tweet
Trust Machina, 2/3: free to start.

Pro is free for your first 14 days, and the clock only starts once you've saved ten things. Nothing to cancel.

After that, the free plan keeps 100 saves and 20 questions a month. Pro is unlimited.
```

- **Attach:** the welcome screen line ("Pro is free for your first 14 days…").
- **First comment:** none.
- **Note:** this states the plan exactly as `functions/quota.py` and
  `functions/entitlement.py` enforce it today (§2, Day-1 condition 5). If the
  limits change, change this post. Name a price only once the App Store shows it.

#### T25 · Day 31 · Thursday · 3/3: everywhere

```tweet
Trust Machina, 3/3: everywhere you are.

Save from your phone in the morning, read it on your laptop at night, ask from either. The web app holds the same library as your iPhone.

mymachina.app
```

- **Attach:** phone and laptop side by side, the same card on both.
- **First comment:** none.

#### T26 · Day 33 · Saturday · Hebrew

```tweet
Machina reads Hebrew.

Save a Hebrew article and the card comes back in Hebrew, right to left, with the right tags. Search in Hebrew. Ask in Hebrew.

A mixed library is fine. Most libraries are.
```

- **Attach:** a Hebrew card next to an English card in the same feed.
- **First comment:** none.

#### T27 · Day 34 · Sunday · what Machina learned this month

```tweet
What Machina learned this month.

Your questions from last Sunday, asked in real libraries, with permission:

[fill: three of the best questions from T22, each with a short answer excerpt]

Every answer came from someone's own saves. Nothing from the web.
```

- **Attach:** three Ask screenshots stacked into one image.
- **First comment:** `This becomes a monthly post, on the first Sunday of every month.`
- **Note:** this is BRANDING D-4's monthly "what Machina learned" post, and the
  account's first standing series.

### Week 6: The bigger idea.

#### T28 · Day 36 · Tuesday · share a card, or an answer

```tweet
Any card in Machina can be shared as a page. So can an answer from Ask, with its sources.

The summary, the key points, the link. Nothing else from your library.

Send the card, not the link. They get the point before they open it.
```

- **Attach:** a shared card's page as it previews in WhatsApp.
- **First comment:** `A shared card looks like this: mymachina.app/s?id=[fill: a real shared card]`

#### T29 · Day 37 · Wednesday · the belief (text only)

```tweet
Saving was never the hard part.

Recalling it is how you learn it.

Machina is for the second half.
```

- **Attach:** none. Three lines are the whole product.
- **First comment:** none.

#### T30 · Day 38 · Thursday · the Daily Brew

```tweet
Once a day, Machina deals you a few saves worth another look. The Daily Brew.

Swipe through them: keep one, set a reminder, or archive it.

A few minutes over coffee, and the things you saved stop disappearing.
```

- **Attach:** a 10-second clip: the Daily Brew notification, tapped, and the deck
  dealing its cards. The notification needs your iPhone; the deck can come from
  the capture kit.
- **First comment:** `The Daily Brew is part of Machina Pro, free for your first 14 days. You choose the hour it arrives.`

#### T31 · Day 39 · Friday · thirty days

```tweet
Thirty days of Machina.

[fill] libraries. [fill] saves. The most-saved source: [fill]. The question asked most: "What did I save about ___?"

Thank you.

What should Machina do next? Reply, and it goes on the list.

apps.apple.com/[fill]
```

- **Attach:** one clean image with the three numbers in the app's type.
- **First comment:** none. Reply to every suggestion.
- **Note:** the numbers come from the first-party `analytics_events` and the
  workspace count. Round down. If a number is embarrassing, post the others and
  leave it out; never inflate.

#### T32 · Day 41 · Sunday · the close

```tweet
Everything you save, finally useful.

Six weeks in, that's still the whole idea behind Machina.

One place, from every app. Read, filed, connected, and ready when you ask.

iPhone and web, free to start.

apps.apple.com/[fill]
```

- **Attach:** the film's endcard, with the official App Store badge added under
  the tagline (never in its place).
- **First comment:** `Web: mymachina.app · Questions: support@mymachina.app`
- **After this post:** the account moves to the standing cadence in §6.

---

## 4. The founder track (the founder's own account)

First person, Mor's voice, and Mor's real story: the founder letter in the app
(Settings → The story behind Machina) is the source, and these posts keep its
words where they can. The founder account carries no link in the body except F2.
Everywhere else the link goes in the first comment, as on the brand account.

#### F1 · Day −7 · Tuesday · the week before

```tweet
I kept saving things everywhere. A post on Instagram, a thread on here, a video on YouTube, an article somewhere else.

I almost never went back. When I did, I couldn't remember which app I'd buried it in.

So I built Machina. It launches next Tuesday.
```

- **Attach:** one still of the app (a finished card), no logo slate.
- **Note:** post only once Apple has approved the build and Day 1 is fixed.

#### F2 · Day 1 · Tuesday · the launch thread (pin it)

```tweet
Today I'm launching Machina.

It started with a frustration I couldn't shake: everything that interested me was scattered across five apps, quietly disappearing.

Machina is one place for everything you save, from any app.
~
You tap Share, pick Machina, and it reads the thing for you: a summary, the key points, tags, and the other saves it connects to.

When a save calls for action, it becomes a to-do. On Sunday, it writes you a short read on your week.
~
And when you need something back, you just ask. The answer comes only from what you saved, with the sources right under it.

Collecting ideas is genuinely my thing. A pile of saved-and-forgotten links felt like a real loss. This is the fix I wanted.
~
Free to start on iPhone and the web, with Pro free for your first 14 days.

I'd love to know what you save first.

apps.apple.com/[fill]
```

- **Attach:** F2.1 gets the 20-second vertical cut (the same as T1.1). F2.2 to
  F2.3 get one still each: a card, an Ask answer.
- **First comment:** none. The link is in F2.4.
- **That evening:** quote-post `@machinaapp`'s T1 with one line, e.g. "The tour,
  one feature per post."

#### F3 · Day 3 · Thursday · the one word that was hardest to get right

```tweet
The hardest thing to get right in Machina wasn't the summaries. It was one word: Saved.

When you share something, the screen says "Saved ✓ · Making your card". Never "Done".

Here's why.
~
Saving and reading are two different jobs. The save is confirmed the moment the server has it. Reading it takes another 15 to 20 seconds.

So the check mark sits on the save, and the line names the work still running. The card finishes on its own.
~
And if you share something you already saved, it tells you so, instead of promising a new card that never shows up.

An app you trust with everything you save can't fudge the one thing it's for.
```

- **Attach:** F3.1 gets the share extension's terminal frame, recorded on your iPhone.
- **Note:** this is Show HN day (§8). The HN crowd likes exactly this kind of
  detail. Every fact is from `ShareViewController.swift` (`completeScanSuccess`,
  `showDuplicateResult`).

#### F4 · Day 10 · Thursday · why there's no "AI" in the name (text only)

```tweet
Machina was called Machina AI until shortly before launch. I cut the AI.

It's the plumbing, not the product. Nobody saves a talk hoping a model will read it. They save it hoping to find it again, and use it.

So it's just Machina. The AI stays under the hood.
```

- **Attach:** none.
- **Note:** the one post where the word "AI" appears, because the decision is the
  story (BRANDING D-1). Drop F4 if you'd rather the word never appear anywhere.

#### F5 · Day 24 · Thursday · the answer I'm proudest of

```tweet
The answer I'm proudest of in Machina is the one where it says no.

Ask about something you never saved, and it tells you: "I couldn't find anything in your library about that yet."

No guessing, nothing pulled from the web. I'd rather it admit a gap than sound right.
```

- **Attach:** quote-post T20 (the screenshot rides along).

#### F6 · Day 39 · Friday · thirty days, what I learned

```tweet
Thirty days since Machina launched. What I learned:

[fill: two or three real, specific lessons. What people saved first, the feature people used that I didn't expect, the bug that taught me something.]

Thank you for every save and every reply. What should I build next?
```

- **Attach:** none, or the one screenshot the lesson is about.

**Between posts:** reply as yourself to anyone who mentions Machina, quote-post
the brand's series posts with one personal line when there's a real story behind
the feature, and never argue.

---

## 5. The arcs, explained

- **Saves from anywhere (week 2)** is the hero, so it gets the first series. The
  three parts are the three formats people actually save (article, video,
  screenshots), in rising order of surprise. Everyone expects an app to read an
  article. Fewer expect it to watch a video. Almost nobody expects five
  screenshots to become one read card.
- **What a card knows (week 3)** answers the question week 2 raises: fine, it holds
  everything, but what does it do with it? Summary, next step, connections: in
  the order the product does them, ending on the one thing a folder can never do.
- **Ask (week 4)** is deliberately fourth. Leading with Ask sells a chatbot, and
  every app has one. After three weeks of capture and understanding, Ask lands as
  the payoff, and the series is built on trust rather than capability. The honest
  no is the one part competitors can't post.
- **Trust (week 5)** is where a curious follower becomes a user. Yours, free to
  start, everywhere: ownership, price and reach, each one a reason not to
  hesitate. Hebrew sits here because it's a trust signal too: the app was built
  for a real bilingual life, not a demo.
- **The bigger idea (week 6)** turns outward. Sharing is the product's own growth
  loop. The belief post says the founder letter's line in the brand's voice.
  The Daily Brew is the habit. The numbers post is honest by design, and the
  close repeats the launch promise, now earned.

The Sunday posts are the spine: they land the day the product does its weekly
work. By week three, a follower knows Sunday means the recap.

---

## 6. Engagement rules and the standing cadence

**Launch week.** Reply to every reply within the hour, for seven days, from both
accounts. On X the replies are the product demo for everyone who didn't click.
Answer questions with a screenshot where one exists. Never argue. If someone
compares Machina to another app, say what Machina does, never what the other app
fails to do.

**Quote posts.** When a user posts a card, a recap or an Ask answer, quote it with
one sentence and no link. User posts are the best content the account will ever
have, and quoting them teaches people to post more.

**Never.** No engagement bait ("like if you agree"). No hashtags. No emoji. No
threads longer than five. No posts about competitors. No screenshots of private
libraries without written permission. No "AI-powered", "second brain",
"bookmark manager" or "Machina AI". No em dashes, including in replies.

**After T32,** three brand posts a week, indefinitely:
- **Tuesday:** one real card, one real save, one line of copy. The "look what it
  did with this" post.
- **Thursday:** an answer to a real question from the replies, or one small
  feature, shown in a clip.
- **Sunday:** recap-shaped. On the first Sunday of the month, the "What Machina
  learned this month" post in T27's format.

The founder keeps building in public at their own pace: a decision, a bug, a
number, a lesson. One a week is plenty.

**Metrics that matter, checked weekly:** App Store installs from X (App Store
Connect, source `x.com`), profile visits, and the reply count on series posts.
Ignore likes. The month-one target from BRANDING D-4 stands: 1,000 installs, 20%
week-2 retention, 50 organic shares. Retention gates all paid spend, X ads
included.

---

## 7. Attachments: what exists, and what still has to be made

**Video that already exists** (all render from `marketing/launch-clip/`):

| Asset | Where it lives | Use it for |
|---|---|---|
| Launch film (67s, 16:9 and 9:16, `MachinaLaunchVertical`) | `main` | the header still, the endcard (T1.5, T32), act-one still (T2) |
| Highlight reel (`MachinaReel`, 82s, 9:16, real-app capture) | branch `claude/machina-reel-pilot` | T1.1 and F2.1 as a 20s cut of its opening; Connect beat (T15) |
| Feature clips SAVE, FIND, ASK, REVISIT (30 to 63s each) | branches `claude/clip-save`, `-find`, `-ask`, `-revisit` | T10, T7/T19, T12, and as weekly organic Reels |
| Meta ads 1 to 3 (15 to 20s, 9:16 and 4:5; in production since 2026-10-02) | branches `claude/ad-card`, `claude/ad-trip`, `claude/ad-todo` | T1.1 (ad 1), T7 (ad 2), T14 (ad 3), and the Meta campaign (§8) |

None of those branches is merged yet. They're waiting on your review. The reel,
the clips and the ads all show the real app (`capture/`), driven on a demo
account. The one thing they can't show is the native share sheet.

**Stills and clips still to make:**

| # | Attachment | Used by | Source |
|---|---|---|---|
| A3 | Share from Instagram to a finished card, 12s, with "Saved ✓ · Making your card" | T3, F3 | **your iPhone** (native share extension) |
| A4 | Annotated card, six callouts | T4, Product Hunt, App Store | capture kit still + callouts |
| A5 | Import sheet + feed filling | T5 | capture kit, or a fresh account on your phone |
| A6 | This week in Machina | T6, T17 | **real, with permission** (`[fill]`) |
| A7 | Six-card grid from launch week | T8 | **real users, with permission** |
| A8 | Article and its card, split | T9 | capture kit + a screenshot of the article |
| A9 | Revisit tab | T12 | REVISIT clip / ad 3 still |
| A10 | Article card and note card, side by side | T13 | capture kit |
| A11 | Graph with cluster chips | T1.3, T15 | capture kit (re-shoot on today's graph) |
| A12 | Search clip | T16 | **your phone**, a real query (see T16's note) |
| A13 | The honest-no screenshot | T20, F5 | your phone (it's the real string either way) |
| A14 | Collection header with "Ask about this", PIN-locked tile | T21 | capture kit |
| A15 | Settings: Export my data, Delete account | T23 | capture kit or your phone |
| A16 | Welcome screen trial line | T24 | a fresh account on your phone |
| A17 | Phone and laptop, same card | T25 | your phone + mymachina.app |
| A18 | Hebrew card beside an English card | T26 | your phone |
| A19 | Three stacked Ask screenshots | T27 | **real, with permission** |
| A20 | Shared card in a WhatsApp preview | T28 | your phone |
| A21 | Daily Brew push and the deck | T30 | your phone (push) + capture kit (deck) |
| A22 | Thirty-day numbers card | T31 | **real numbers** |

Every still: light mode, 2x, real content, status bar at 9:41 with full battery
and signal. Every clip: captions burned in, ending on a still frame for at least
one second so the last frame reads as the thumbnail.

---

## 8. Beyond X: the same story, other rooms

**Product Hunt, Day 1.** Tagline: `Everything you save, finally useful.` Gallery:
the 20s cut, A4 (annotated card), the film stills, A6 (recap), the Ask clip as a GIF.
First comment: the fragmentation story from T2, then "one place" from T1, then the
three-line belief from T29, then what's free (T24). Don't lead the first comment
on Ask (BRANDING A-5). Ask TestFlight testers, by name, to comment on what they
saved, not to upvote.

**Show HN, Day 3 (Thursday).** Title: `Show HN: Machina, one place for everything
you save from any app, with cited answers from your own saves (iOS and web)`.
Body: the stack in plain terms (native share extension, Python Cloud Functions,
Gemini for reading, embeddings in Firestore, retrieval that cites its sources),
then the two interesting engineering problems: a share extension that never
claims more than it knows (F3's story), and a relevance judge so search returns
the one right card instead of a wall. Link the honest-no screenshot. Answer every
technical question the same day.

**LinkedIn, Days 1 and 8.** Day 1: F2 as a single post with the film, for people
who save work articles they never read. Day 8: T8. The productivity audience there
is large and unglamorous, and it converts.

**Reddit, Days 4 and 18.** r/productivity and r/PKMS, value first. Day 4: the
annotated card (A4) with a plain "this is what one save becomes" and no link in
the body. Day 18: the honest-no screenshot with the question "should an
assistant admit when it doesn't know?" Follow each sub's self-promotion rules to
the letter; the link goes in a comment only if someone asks.

**Short-form video (Reels, TikTok, Shorts), weekly.** The four feature clips and
the three ads, one a week, with the matching brand post's text as the caption.

**Meta ads (Instagram and Facebook). The creative is in production; the spend
waits.** Three ads are being built from the real app (§7). Per BRANDING D-4, no
money goes in until the App Store listing is live and week-2 retention holds.
Run them as an App promotion campaign **without the Meta SDK**: install
attribution then comes only from Apple's SKAdNetwork, which keeps the App
Privacy label's "no tracking" true. Meta optimizes less well that way; that's
the accepted cost. Copy per ad (primary text, then headline, CTA "Install"):

| Ad | Primary text | Headline |
|---|---|---|
| 1, what one save becomes | `That talk you saved for later? Share it to Machina and get the key points and the moments that matter, with timestamps.` | `Everything you save, finally useful.` |
| 2, the trip you already planned | `Your trip is already planned. It's just scattered across five apps. Ask Machina, and the answer comes from your own saves, with sources.` | `Ask what you saved.` |
| 3, the screenshot that becomes a to-do | `Screenshot the advice, then actually take it. Machina reads your screenshots and turns the advice into a to-do you can tick off.` | `Saves that turn into to-dos.` |

Ad 1 shows a Pro feature (video key moments), so its copy names no plan.
Ads 2 and 3 show free features; "Free to start" is fine in their description field.

**Email to TestFlight testers, Day 1.** Subject: `Machina is on the App Store.`
Three lines: it's live, here's the link, would you leave a review. Then a
personal thank you. Testers are the first reviews and the first testimonials.

**App Store featuring, three weeks before Day 1.** Submit the featuring request
(App Store Connect → Promote your app) with A4, the 20s cut and the tagline. It
costs nothing.

**Press, Day 1 morning.** A one-page note at `mymachina.app/press` (A4, the 20s
cut, the three-sentence description from T1, the founder's name, the support
email) sent to five indie-iOS writers and newsletters. Short, personal, no
follow-up pressure.

---

## 9. Claims register

Every product claim in these posts, and where it was verified on 2026-10-02 (`main`, build 1344).

| Claim | Where verified |
|---|---|
| Share from any app; the save is confirmed before the card is finished; "Saved ✓ · Making your card"; duplicates are called out | `web/ios/App/ShareExt/ShareViewController.swift` (`completeScanSuccess`, `showDuplicateResult`) |
| Reads the full page; watches YouTube; reads text in screenshots | `functions/scraper.py`, `functions/ai_service.py` (`VIDEO_ANALYSIS_PROMPT`), the App Store description (owner-approved) |
| Summary, key points, category, tags, reading time, related saves, a next step on the card | `web/components/LinkDetailModal.tsx` (`estimatedReadTime`, `getRelatedCards`), `web/lib/takeaway.ts` |
| Video key moments with timestamps that open the video at that moment; Pro-only | `LinkDetailModal.tsx` (timestamp parsing + watch URL with `t`), `functions/main.py` `_video_ingest_allowed` |
| Up to five screenshots become one card, in order | `web/components/AddLinkForm.tsx` (`MAX_IMAGES = 5`) |
| Import from browser bookmarks, Pocket and other read-later exports; folders become tags; first-saved date kept; free plan 500 | `web/lib/importParsers.ts`, `functions/quota.py` (import 500 / 10000), §9 2026-09-20 import entry |
| Notes kept verbatim; "Summarize with Machina" on request | `LinkDetailModal.tsx` "Machina's read" |
| Do this in Revisit; tick, strike, fold; swipe left for "Not for me" | `web/components/DigestView.tsx` `TakeawayRow` (§9 2026-10-02) |
| Graph clusters carry names, with chips above the canvas | `web/components/KnowledgeGraph.tsx` (§9 2026-10-01) |
| Ask doesn't search the web; "Answers come only from what you've saved, with sources you can open"; sources listed under the answer, a tap opens the card | `AskBrain.tsx` (the promise line, `m.sources`, `onOpenLink`), `functions/ai_service.py` |
| The honest-no string | `functions/ai_service.py` `_EMPTY_LIBRARY_ANSWER_EN` |
| Ask on one collection; share a collection as a page; private collections behind a PIN | `CollectionFormModal.tsx` (vault PIN), §9 2026-09-20 collections pass |
| Shared cards and shared answers as public pages | `functions/share_service.py` (`/s`, `/c`, `/a` routes) |
| This week in Machina on Sunday: themes, a standout, an open question; locked teaser on free | `SynthesisCard.tsx`, `functions/digest_service.py` (`is_pro`) |
| The Daily Brew: a daily deck; keep, remind, archive; Pro-only | `SwipeDeck.tsx` (`ActionKind`), `digest_service.py` |
| Reminders that repeat, spaced out | `functions/reminder_service.py`, §9 2026-09-25 |
| 14-day Pro trial, starting at the 10th save, nothing to cancel; free plan 100 saves + 20 questions a month | `functions/entitlement.py` (`TRIAL_DAYS`, `TRIAL_ANCHOR_CARDS`), `functions/quota.py`, `web/components/Onboarding.tsx` |
| No ads, no tracking, nothing sold; Gemini paid tier keeps content out of training; export; in-app deletion | `docs/APP_STORE.md` §1 (App Privacy label), `AIConsentNotice.tsx`, `DataExport.tsx`, `delete_account` |
| Web app at mymachina.app holds the same library | `docs/BRANDING.md` D-8, Vercel |
| Hebrew cards render right to left, with search and Ask in Hebrew | RTL work, builds 1290 to 1313; `empty_library_answer` (Hebrew) |

**Not verified here** (check on a device before the post goes out): T16's exact
query, the text of any screenshot you attach, and that the Daily Brew push
reads as shown in A21.
