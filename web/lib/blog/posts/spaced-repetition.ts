import type { Post } from '../types';

const post: Post = {
    slug: 'spaced-repetition',
    title: 'Spaced repetition: how it works and a schedule you can use',
    description:
        'Spaced repetition means reviewing at growing intervals instead of cramming. The research, the Leitner and SM-2 systems, and a simple 1-7-30-90 day schedule.',
    date: '2026-10-26',
    category: 'Learning science',
    keywords: [
        'spaced repetition',
        'spaced repetition schedule',
        'spaced repetition intervals',
        'spacing effect',
        'leitner system',
        'sm-2 algorithm',
    ],
    faq: [
        {
            q: 'What is the best spaced repetition schedule?',
            a: 'There is no single best one, because the ideal gap depends on how long you need to remember something. In a large 2008 study, the best gap was roughly 20 to 40% of the time until a test one week away, but only 5 to 10% when the test was a year away. Reviewing after 1, 7, 30 and 90 days is a reasonable default for things you want to keep long-term.',
        },
        {
            q: 'Is spaced repetition better than cramming?',
            a: 'For anything you need beyond the next day, yes. In Kornell\'s 2009 flashcard experiments, spacing beat massed study for 90% of participants, even though most of them believed massing had worked better.',
        },
        {
            q: 'Does Anki use SM-2?',
            a: 'Anki\'s original scheduler is based on SuperMemo\'s SM-2 algorithm, with changes. Since version 23.10, Anki also offers a second algorithm called FSRS.',
        },
        {
            q: 'Do the intervals have to expand, or can they be equal?',
            a: 'The evidence is mixed, and the total spread of reviews seems to matter more than their exact pattern. One 2011 study found large gains from spacing tests far apart, but no reliable difference between expanding, equal and contracting schedules.',
        },
        {
            q: 'Can you use spaced repetition without flashcards?',
            a: 'Yes. Any material can be revisited on a spaced schedule: an article, a book chapter, a video or an idea. At each review, try to recall the main points before you look, then check.',
        },
    ],
    body: `Spaced repetition is a way of reviewing something at increasing intervals, for example a day after you learn it, then a week, then a month, instead of going over it many times in one sitting. It works because of the spacing effect: the same amount of review produces much stronger long-term memory when it is spread out. A simple schedule you can start with is to review 1, 7, 30 and 90 days after first learning something, trying to recall it each time rather than just rereading.

## Key takeaways

- Spacing reviews apart beats massing them together, and this has been shown in hundreds of experiments.
- The best gap between reviews grows with how long you need to remember. For a test next week, a gap of a day or a few days works well. For something you want in a year, gaps of weeks work better.
- The exact interval pattern matters less than spreading reviews out at all and actually doing them.
- Combine spacing with [active recall](/blog/active-recall): at each review, retrieve the information before you look at it.

## What is the spacing effect?

The spacing effect is the finding that study spread across time is remembered better than the same study crammed together. Hermann Ebbinghaus noticed it in his 1885 memory experiments. Learning lists of nonsense syllables, he found that [38 repetitions spread over three days](https://psychclassics.yorku.ca/Ebbinghaus/memory8.htm) helped his later relearning as much as 68 repetitions done the day before.

It has held up for over a century. A [2006 meta-analysis by Cepeda and colleagues](https://doi.org/10.1037/0033-2909.132.3.354) gathered 839 assessments of distributed practice from 317 experiments in 184 articles. Spaced study reliably beat massed study, and the best gap between sessions grew as the time until the final test grew. The [2013 Dunlosky review](https://doi.org/10.1177/1529100612453266) of ten study techniques rated distributed practice "high utility," one of only two techniques to get that rating (the other was practice testing).

People still prefer cramming, because it feels better. In Nate Kornell's [2009 flashcard experiments](https://doi.org/10.1002/acp.1537), spacing was more effective than massing for 90% of participants, yet after the first session 72% believed massing had worked better.

## How does spaced repetition work?

When you review something right after learning it, it is still fresh, so the review is easy and adds little. When you wait until it has started to fade, pulling it back takes effort, and that effortful retrieval strengthens the memory more. The psychologists Elizabeth and Robert Bjork describe spacing as a ["desirable difficulty"](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf): it slows down apparent progress during study but supports long-term retention.

Spaced repetition systems turn this into a rule: each time you remember an item, wait longer before the next review. Each time you forget it, review it sooner.

## How far apart should reviews be?

The most useful data comes from a [2008 study by Cepeda, Vul, Rohrer, Wixted and Pashler](https://doi.org/10.1111/j.1467-9280.2008.02209.x). More than 1,350 people learned a set of obscure facts, reviewed them once after a gap of up to 3.5 months, and took a final test up to a year later.

For recall, the best gaps they found (smoothed across the gaps they tested) were:

| When you need to remember it | Best gap before reviewing | Gap as share of that time |
|---|---|---|
| 1 week | about 3 days | 43% |
| 5 weeks | about 8 days | 23% |
| 10 weeks | about 12 days | 17% |
| 1 year | about 27 days | 8% |

Getting the gap right mattered a lot. Compared with reviewing immediately, the best gap improved final recall by 10%, 59%, 111% and 77% for those four delays. Past the best gap, performance fell off only gradually, so waiting a bit too long cost less than reviewing too soon.

The practical lesson: if you want something to last, your gaps need to grow into weeks and months. Daily review of the same item is wasted effort after the first few days.

## Do intervals need to expand?

Most systems use expanding intervals, where each gap is longer than the last. That makes sense, since each successful review makes the memory more durable. But the evidence that expansion itself is what helps is weaker than many guides suggest.

In a [2011 study, Karpicke and Bauernschmidt](https://doi.org/10.1037/a0023436) had people practice recall on three tests with different schedules. Spreading the tests far apart produced large gains in long-term retention, about 200% better than no spacing at all. But expanding, equal and contracting schedules did not reliably differ. What mattered was the total spacing.

So don't agonize over whether your second review is on day 6 or day 8. Spread reviews out, make each one an act of recall, and keep doing them.

## What is the Leitner system?

The Leitner system is a low-tech way to run spaced repetition with paper flashcards. It comes from German science journalist Sebastian Leitner's 1972 book *So lernt man lernen* ("How to learn to learn"), as summarized [on Wikipedia](https://en.wikipedia.org/wiki/Leitner_system).

1. Get three to five boxes (or envelopes) and number them.
2. All new cards start in box 1.
3. Review each box on its own schedule, with longer gaps for higher boxes: for example, box 1 every day, box 2 every 3 days, box 3 every 5 days.
4. When you answer a card correctly, move it up one box. When you miss it, move it back to box 1.

Cards you know well drift toward the rarely reviewed boxes, and cards you struggle with keep coming back. That is the whole idea of spaced repetition, with no software.

## What are SM-2, SuperMemo and Anki?

SuperMemo is spaced repetition software by Piotr Wozniak. Its [SM-2 algorithm](https://en.wikipedia.org/wiki/SuperMemo), released in 1987, became the basis for several popular flashcard apps, including Anki and Mnemosyne. As [described by Wozniak](https://super-memo.com/english/ol/sm2.htm):

- After you first learn an item, review it after 1 day, then after 6 days.
- After that, each new interval is the previous interval multiplied by an "easiness factor," which starts at 2.5 and never drops below 1.3.
- You grade each answer from 0 to 5. Good answers raise the easiness factor and stretch future intervals; a failed answer (below 3) restarts the item's intervals from the beginning.

[Anki](https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm), the popular free flashcard app, built its scheduler on a modified SM-2. Since version 23.10 it also offers FSRS, a newer algorithm that models how likely you are to remember each card. Tools like these are best for large sets of discrete facts: vocabulary, anatomy, legal terms, formulas.

## A spaced repetition schedule you can use: 1-7-30-90

If you don't want software, use four reviews counted from the day you first learn something:

| Review | When | What to do |
|---|---|---|
| 1 | Day 1 (the next day) | Recall the main points from memory, then check |
| 2 | Day 7 | Recall again; note what you missed |
| 3 | Day 30 | Recall and connect it to something else you know |
| 4 | Day 90 | Recall; decide whether it is worth keeping |

The gaps between reviews are 1, 6, 23 and 60 days, which happens to start the same way SM-2 does (1 day, then 6). It is also in line with Cepeda's data for material you want to keep for months. It is a sensible default, not a proven optimum, and no fixed schedule is.

If you blank completely on a review, treat it like a missed Leitner card: look it up, then start the schedule again from day 1.

## Spaced repetition for things that aren't flashcards

Flashcards work well for facts with clear answers. Most of what people want to remember is not like that: the argument of an article, the steps in a recipe video, an idea from a podcast. The schedule still applies; only the review changes.

Say you read an article on negotiation on Monday.

- **Tuesday:** without opening it, write three sentences on its main points. Then skim it and fix what you got wrong.
- **Next Monday:** recall the one technique you most want to use, and where you would use it.
- **A month later:** recall it again and link it to something else you have read or done.
- **Three months later:** recall the gist. If it has been useful, keep it. If not, let it go.

Not everything deserves four reviews. Being selective is part of the method. [How to remember what you read](/blog/how-to-remember-what-you-read) covers the full process for articles, videos and podcasts, and [the forgetting curve](/blog/forgetting-curve) explains why the first review matters most.

## Doing this automatically with Machina

The hard part of spaced repetition is remembering to review. Machina handles the scheduling for the things you save. Set a Smart review reminder on a save and Machina brings it back the next day, a week after that and a month after that, the first three steps of the schedule above. Each save already has a summary and key concepts, so you can try recalling the point first and then check yourself against the summary in a few seconds.

On Sundays, a weekly synthesis pulls together what you saved that week and how it connects, which works as one more spaced pass over recent material.

[Machina](/) is free to start on iPhone and the web.`,
};

export default post;
