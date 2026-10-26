import type { Post } from '../types';

const post: Post = {
    slug: 'how-to-remember-what-you-read',
    title: 'How to remember what you read: a system for articles, videos and podcasts',
    description:
        'How to remember what you read, watch and listen to: a five-step system backed by memory research, with examples for articles, YouTube videos and podcasts.',
    date: '2026-10-26',
    category: 'Learning science',
    keywords: [
        'how to remember what you read',
        'how to retain information from articles',
        'remember what you watch on youtube',
        'how to remember podcasts',
        'how to retain what you read',
    ],
    faq: [
        {
            q: 'Why do I forget what I read so quickly?',
            a: 'Mostly because you read it once and never retrieved it. Memory fades fastest right after learning, and rereading or highlighting does little to stop that. Recalling the material from memory, and doing it again a few days later, slows forgetting far more.',
        },
        {
            q: 'Should I take notes while reading or after?',
            a: 'Brief notes while reading are fine, but write your main summary after a section with the source closed. Writing from memory turns the summary into retrieval practice, which is one of the best-supported ways to make learning stick.',
        },
        {
            q: 'How do you remember what you watch on YouTube?',
            a: 'Write down two or three questions before you press play, pause at the end of each section to say the main point out loud, and write a short summary from memory when it ends. Then recall it again the next day and a week later.',
        },
        {
            q: 'Do I need to remember everything I read?',
            a: 'No. Most reading is for enjoyment or a quick answer, and that is fine. Save the effort for the few things you actually want to use or build on, and let the rest go.',
        },
    ],
    body: `To remember what you read, watch or listen to, do five things: decide before you start what you want from it, summarize it afterward in your own words without looking, connect it to something you already know, test yourself on it a day or so later, and come back to it at spaced intervals. Reading once, however carefully, mostly fades. These steps turn one exposure into several acts of recall, which is what makes memory last.

## The short version

- Before: write down two or three questions you want the piece to answer.
- Right after: close it and write three sentences on what it said, from memory.
- Connect: note how it fits with, or contradicts, something you already know.
- Later: recall it again after a day, a week and a month before you look at it.
- Be selective. Do this for the few things that matter, not everything you consume.

## Why do you forget what you read?

Because a single exposure fades fast, and most reading never gets a second one. The [forgetting curve](/blog/forgetting-curve) is steepest in the first hours after learning. On top of that, the things most people do to "study" an article (rereading it, highlighting it) feel productive but do little. A [2013 review of ten learning techniques](https://doi.org/10.1177/1529100612453266) rated rereading and highlighting low utility, and rated practice testing and spacing high.

The system below is built on those two high-utility techniques, plus a few that help you understand the material in the first place.

## Step 1: Decide why you're reading it

Before you start, write down what you want from the piece, ideally as questions. "What is the actual mechanism behind this diet claim?" "What would I do differently after reading this?" If you can't think of a question, skim the headings first.

There is research behind this for video in particular. In a 2017 study by Carpenter and Toftness, [85 students watched a short video on the history of Easter Island](https://bps.org.uk/research-digest/heres-simple-way-boost-your-learning-videos-prequestion) in three segments. Half tried to answer two questions before each segment, almost always got them wrong, and received no feedback. On the final test, that group outperformed the control group, both on the questions they had seen and on new ones. A [2018 follow-up with longer, real lecture videos](https://pure.royalholloway.ac.uk/en/publications/the-limited-effects-of-prequestions-on-learning-from-authentic-le/) found a smaller effect, mostly limited to the information the questions were about. So questions up front help you catch what you're looking for. Choose them well.

This step also tells you whether the piece deserves the rest of the process at all.

## Step 2: Summarize it in your own words, from memory

When you finish (or at the end of each major section), close the source and write what you remember: the main claim, the key reasons, and anything that surprised you. Three to five sentences is enough. Then open the source and correct what you missed.

The "from memory" part is what makes this work. It turns summarizing into retrieval practice. In [Roediger and Karpicke's classic 2006 study](https://doi.org/10.1111/j.1467-9280.2006.01693.x), students who had one short study period with a passage followed by three recall attempts remembered 61% of it a week later; students who spent all four periods studying it remembered 40%.

A caveat: summarizing alone was rated low utility in the Dunlosky review, partly because many people need practice to summarize well and the results across studies were mixed. Copying the author's sentences into a summary is not the same thing as writing it from memory in your own words. Do the second one. More techniques in [active recall](/blog/active-recall).

## Step 3: Connect it to what you already know

Once you have the gist, ask yourself a few questions:

- Why would this be true? What would have to be true for it to be wrong?
- Where have I seen something similar, or the opposite?
- Where would I actually use this?

Asking "why" (elaborative interrogation) and explaining how new information fits with what you know (self-explanation) were both rated moderate utility in the Dunlosky review: helpful, with less evidence than testing and spacing. Meaning matters a lot for memory. Ebbinghaus, whose famous experiments used nonsense syllables, found that he could learn stanzas of poetry with [about one-tenth of the repetitions](https://psychclassics.yorku.ca/Ebbinghaus/memory5.htm) the same amount of nonsense would have needed.

Write the connection down, even as one line: "Same idea as the habit-stacking chapter in that book, but with data."

## Step 4: Test yourself later

The next day, before you look at your notes, try to recall the piece. What were the main points? What was the one thing you planned to use? Then check.

Recall later is where most of the benefit comes from. In a [2011 study in *Science*](https://doi.org/10.1126/science.1199327), 200 students learned science texts either by making concept maps or by practicing recall. A week later the recall group did about [50% better](https://www.sciencedaily.com/releases/2011/01/110121111216.htm), including on questions that required inference.

## Step 5: Revisit it on a spaced schedule

Repeat the recall at growing intervals. A simple schedule is 1, 7, 30 and 90 days after you first read it. Spacing reviews out is one of the two techniques the Dunlosky review rated high utility, and a [large 2008 study](https://doi.org/10.1111/j.1467-9280.2008.02209.x) found that for material you want to keep for a year, waiting about three to four weeks before reviewing worked best. The full reasoning and alternatives are in [spaced repetition](/blog/spaced-repetition).

At each review, recall first and look second. If something no longer seems useful, drop it.

## How to retain information from articles

Here is the whole process for a long article you want to keep:

1. **Before:** read the title and headings. Write two questions.
2. **During:** read normally. Mark one or two passages at most, not whole paragraphs.
3. **After:** close the tab. Write three sentences from memory answering your questions, plus one line on how it connects to something you know. Reopen and fix mistakes.
4. **Next day:** recall the three points without looking.
5. **One week, one month, three months:** recall again, then check.

Total extra time is a few minutes spread over three months.

## How to remember what you watch on YouTube

Video is harder than text because it moves on without you, and it is easy to drift. A [Harvard study of a 21-minute online statistics lecture](https://doi.org/10.1073/pnas.1221764110) found that students who got short quizzes between its four segments reported mind wandering on 19% of attention checks, versus about 40% for students who didn't, took more notes, and scored 90% on the final test against 76% and 68% for the comparison groups. It was a single lecture in a lab setting, but the tactic is easy to copy:

- **Before you press play:** write two or three questions.
- **At the end of each section or chapter:** pause and say the main point out loud in one sentence. Jot the timestamp of anything you might want to rewatch.
- **When it ends:** write a short summary from memory, and one thing you will try.
- **Later:** recall it the next day and a week later, before looking at your notes.

## How to remember podcasts

Podcasts are the hardest format, because you usually listen while doing something else and there is no text to go back to. Keep the method light:

- **Right after an episode,** record a one-minute voice memo or write a few lines on the one idea worth keeping. If nothing comes to mind, that's an answer too.
- **Note the episode and rough timestamp** of the part you want, so you can find it again.
- **Retrieve it later** by trying to explain the idea to someone, which is the most natural recall practice there is.

## A cheat sheet by format

| Format | Before | Right after | Later |
|---|---|---|---|
| Article | Write 2 questions | 3 sentences from memory, plus 1 connection | Recall at 1, 7, 30, 90 days |
| Video | Write 2-3 questions | Summary from memory, 1 thing to try | Recall next day and next week |
| Podcast | Note what you hope to get | 1-minute voice memo of the key idea | Explain it to someone |
| Book | Skim the contents | Recall each chapter before the next | 1-page summary from memory |

## Doing this with Machina

Machina takes care of the parts that are easy to skip. Save an article or video from the iPhone share sheet (or paste a link on the web), and Machina writes a summary, key concepts and tags, and links it to related things you saved before. A long YouTube video becomes a few key points with timestamps. You can add your own notes to any card, which is the right place for your from-memory summary and your one-line connection; notes are searchable, and Ask Machina uses them.

For steps 4 and 5, set a Smart review reminder on a save and Machina brings it back the next day, a week after that and a month after that: the first three steps of the schedule above. Recall the point first, then check against the summary. When you want to test yourself across many saves, answer a question in your head, then ask Machina, which answers from your own library and cites the saves it used. There is more on what to keep and what to let go in [why you never look at saved posts again](/blog/why-you-never-look-at-saved-posts-again).

[Machina](/) is free to start on iPhone and the web.`,
};

export default post;
