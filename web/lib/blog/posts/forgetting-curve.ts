import type { Post } from '../types';

const post: Post = {
    slug: 'forgetting-curve',
    title: 'The forgetting curve: why you forget what you read',
    description:
        'The Ebbinghaus forgetting curve, explained with his real data: what it measured, what popular stats get wrong, and what actually slows forgetting.',
    date: '2026-10-26',
    category: 'Learning science',
    keywords: [
        'forgetting curve',
        'ebbinghaus forgetting curve',
        'how fast do we forget',
        'ebbinghaus savings',
        'why do we forget what we read',
    ],
    faq: [
        {
            q: 'How fast do we forget?',
            a: 'It depends heavily on what you learned and whether you revisit it. In Ebbinghaus\'s experiments with nonsense syllables, forgetting was fastest in the first hour and then slowed sharply, with much of the remaining memory still measurable a month later. Meaningful material that you retrieve and review fades far more slowly.',
        },
        {
            q: 'Is it true that we forget 70% of what we learn within 24 hours?',
            a: 'There is no good evidence for that figure as a general rule. It is often attributed to Ebbinghaus, but he measured how much faster he could relearn a list, not what percentage he remembered, and his data does not show a 70% loss after one day.',
        },
        {
            q: 'How do you beat the forgetting curve?',
            a: 'Retrieve the information from memory instead of rereading it, review it at spaced intervals, and connect it to things you already know. Each successful retrieval makes the next drop-off slower.',
        },
        {
            q: 'Has the Ebbinghaus forgetting curve been replicated?',
            a: 'Yes. In 2015, Murre and Dros repeated the experiment with one subject who spent about 70 hours learning and relearning nonsense syllable lists, and the resulting curve closely resembled Ebbinghaus\'s original.',
        },
    ],
    body: `The forgetting curve is a graph of how quickly a memory fades after you learn something, first measured by the German psychologist Hermann Ebbinghaus in 1885. In his experiments, forgetting was steepest in the first hour and then slowed down a lot: an hour after learning a list, relearning it saved him about 44% of the original effort, a day later about 34%, and a month later still about 21%. You forget what you read for the same reason. You meet it once, never retrieve it, and the steep early part of the curve does its work.

## Key takeaways

- Ebbinghaus measured "savings," how much faster he could relearn a list. That is not the same as the percentage of the list he remembered.
- The popular claim that "you forget 70% in 24 hours" is not what his data shows, and we could not trace it to any primary study.
- His results were replicated in 2015, using the same method and the same kind of material.
- Three things flatten the curve: retrieving the information, spacing out reviews, and connecting it to what you already know.

## What is the Ebbinghaus forgetting curve?

Ebbinghaus wanted to measure memory without the influence of prior knowledge, so he used material with as little meaning as possible: lists of nonsense syllables. He used [only himself as the subject](https://doi.org/10.1371/journal.pone.0120644). In his main experiment he learned series of 13 syllables until he could recite them, waited a set amount of time, then learned the same series again and recorded how much less work the second round took. His findings were published in 1885 and [translated into English](https://psychclassics.yorku.ca/Ebbinghaus/index.htm) as *Memory: A Contribution to Experimental Psychology*.

## What did Ebbinghaus actually find?

Here are his savings scores at each delay, as tabulated in the [2015 replication paper by Murre and Dros](https://doi.org/10.1371/journal.pone.0120644):

| Time since learning | Savings when relearning |
|---|---|
| 20 minutes | 58.2% |
| 1 hour | 44.2% |
| 9 hours | 35.8% |
| 1 day | 33.7% |
| 2 days | 27.8% |
| 6 days | 25.4% |
| 31 days | 21.1% |

The shape is the famous part. Most of the drop happens early, and then the curve flattens. Ebbinghaus [put it this way himself](https://psychclassics.yorku.ca/Ebbinghaus/memory7.htm), in substance: forgetting is very rapid at first and very slow later on.

## Why "savings" is not the same as "percent remembered"

Savings is the share of the original learning effort you no longer need when you relearn. Murre and Dros give a simple example: if a list took 25 repetitions to learn the first time and 20 to relearn, the savings is 20%.

So a 33.7% savings after one day means relearning took about two-thirds as long as learning from scratch. It does not mean Ebbinghaus could recall 33.7% of the syllables, or that he had forgotten 66.3% of them. Savings is a more sensitive measure than recall: a [1978 study by Thomas Nelson](https://doi.org/10.1037/0278-7393.4.5.453) found savings in relearning even for items people could no longer recognize. Murre and Dros also note that savings and recall measures do not always agree.

This matters because most forgetting curve graphs online put "% remembered" on the vertical axis and then attach Ebbinghaus's name and numbers to it. That is a different measure from the one he used.

## Where does "you forget 70% in 24 hours" come from?

Not from Ebbinghaus's data. His figures are savings scores, and even read loosely as "what's left," they show about a third remaining after a day, not 30%. We looked for a primary study behind the 70% figure (and its cousins, like "50% in an hour, 90% in a week") and could not find one. Treat any precise "you forget X% in Y hours" claim without a citation as made up.

Two more limits are worth keeping in mind:

- **One person, meaningless material.** The original curve is one man's memory for nonsense syllables. It was designed to strip out meaning, which is exactly what makes real material easier to keep.
- **Meaning changes everything.** Ebbinghaus also learned stanzas of Byron's *Don Juan*. Each 80-syllable stanza took him [hardly nine repetitions](https://psychclassics.yorku.ca/Ebbinghaus/memory5.htm), which he estimated was about one-tenth of what the same number of nonsense syllables would have needed.

## Has the forgetting curve been replicated?

Yes. In 2015, Jaap Murre and Joeri Dros published a [replication in *PLOS ONE*](https://doi.org/10.1371/journal.pone.0120644). Dros, then 22, served as the single subject and spent about 70 hours learning and relearning series of nonsense syllables at the same delays Ebbinghaus used, from 20 minutes to 31 days.

The curve closely resembled the original. Dros's savings were 47.2% at 20 minutes, 31.7% at one day, and 4.1% at 31 days. That last figure is much lower than Ebbinghaus's 21.1%, and the authors discuss possible reasons, including more interference and individual differences. They also found that the curve is probably not perfectly smooth: there seems to be a small upward jump at the 24-hour point. Sleep is one possible explanation, but the paper does not establish it.

## How fast do we forget, really?

The honest answer is that there is no single rate. It depends on how meaningful the material is to you, how well you understood it in the first place, how much similar material you encounter afterward, and above all whether you ever retrieve it again. What does generalize from Ebbinghaus is the shape: a steep early drop, then a long, slow tail.

## What flattens the forgetting curve?

**Retrieval.** Pulling information out of memory slows forgetting more than reviewing it. In [Roediger and Karpicke's 2006 study](https://doi.org/10.1111/j.1467-9280.2006.01693.x), students who only reread a passage lost about 52% of what they could recall over the following week. Students who had practiced recall three times lost about 14%. More on this in [active recall](/blog/active-recall).

**Spacing.** Reviews spread out over time beat reviews bunched together. Ebbinghaus himself found that [38 repetitions spread over three days](https://psychclassics.yorku.ca/Ebbinghaus/memory8.htm) worked as well as 68 crammed into one day. A [2008 study of more than 1,350 people](https://doi.org/10.1111/j.1467-9280.2008.02209.x) found that the right gap before a review improved recall a year later by 77% compared with reviewing immediately. See [spaced repetition](/blog/spaced-repetition) for a schedule.

**Meaning and connections.** The *Don Juan* result points the same way as later research: material you understand and can link to what you already know is far easier to keep. Asking yourself why something is true, and explaining how it fits with what you know, are techniques the [2013 Dunlosky review](https://doi.org/10.1177/1529100612453266) rated as moderately useful (elaborative interrogation and self-explanation).

## What this means for everything you save

Saving an article, a video or a post feels like keeping it. In memory terms, nothing has happened yet. You read it once, you hit save, and nothing about saving makes you retrieve it, space it or connect it. Then it sits at the bottom of a list you never open, and the steep part of the curve runs its course with nothing to slow it down.

The fix is not to save less but to treat a save as the start of a process:

1. **When you save, write one line on why.** That forces a moment of processing and gives you a cue later.
2. **Revisit it the next day.** Try to recall the main point before you open it. This catches the steepest part of the curve.
3. **Come back at growing intervals.** A week, a month, three months.
4. **Connect it.** Link it to something else you saved or know.
5. **Let go of what doesn't hold up.** Not every save deserves to be remembered.

There is more on why saved posts go unread in [why you never look at saved posts again](/blog/why-you-never-look-at-saved-posts-again).

## Doing this with Machina

Machina is built around that process. When you save something, it writes a summary and key concepts and links the save to related things you saved before, which handles the "connect it" step. Set a Smart review reminder on a save and it comes back the next day, a week later and a month later, so the reviews happen without you keeping a calendar. A weekly synthesis on Sundays pulls the week's saves together and shows how they connect. When a reminder comes up, try to recall the point before you open the card; that turns a reminder into retrieval.

[Machina](/) is free to start on iPhone and the web.`,
};

export default post;
