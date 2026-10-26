import type { Post } from '../types';

const post: Post = {
    slug: 'active-recall',
    title: 'Active recall: the study method that actually works',
    description:
        'Active recall means pulling information out of memory instead of rereading it. What the research shows, why it beats highlighting, and how to use it.',
    date: '2026-10-26',
    category: 'Learning science',
    keywords: [
        'active recall',
        'what is active recall',
        'active recall study method',
        'active recall vs passive review',
        'testing effect',
        'retrieval practice',
    ],
    faq: [
        {
            q: 'Is active recall better than rereading?',
            a: 'For anything you need to remember more than a day later, yes. In Roediger and Karpicke\'s 2006 study, rereading did slightly better on a test five minutes later, but students who had practiced recall remembered far more a week later.',
        },
        {
            q: 'What is the difference between active recall and spaced repetition?',
            a: 'Active recall is how you review: you retrieve the information from memory instead of looking at it again. Spaced repetition is when you review: at growing intervals instead of all at once. They work best together, with recall sessions spread out over days and weeks.',
        },
        {
            q: 'Does active recall still work if I get the answers wrong?',
            a: 'Yes, as long as you check the right answer afterward. A 2014 meta-analysis found retrieval practice beat restudying even without feedback, and the benefit was roughly twice as large when people saw the correct answer after trying.',
        },
        {
            q: 'Are flashcards active recall?',
            a: 'Only if you answer before you flip. Reading the front and back together is just rereading in a smaller format. Say or write the answer first, then check it.',
        },
        {
            q: 'Does active recall help with understanding, or only with memorizing facts?',
            a: 'It helps with understanding too. In a 2011 study published in Science, students who practiced recall outperformed students who made concept maps on questions that required inference, not just on factual recall.',
        },
    ],
    body: `Active recall is the practice of pulling information out of your memory, by quizzing yourself, writing down what you remember, or explaining an idea without looking, instead of putting it back in by rereading. Each time you successfully retrieve something, it gets easier to retrieve the next time, which is why recall beats rereading for anything you want to remember beyond the next few hours. Researchers call this the testing effect, and it is one of the best-replicated findings in learning science.

## Key takeaways

- Retrieving information strengthens memory more than reviewing it again. In one classic experiment, students who practiced recall remembered 61% of a passage a week later, against 40% for students who only reread it.
- Rereading and highlighting feel productive because the material starts to look familiar. Familiar is not the same as recallable.
- The core method is simple: close the source, write or say what you remember, then check what you missed.
- It works best spread out over time, and it works for articles, videos and podcasts, not only for exams.

## What is active recall?

Most studying is input: you read the chapter again, look over your highlights, watch the lecture a second time. Active recall flips it to output. You close the book and try to produce the information yourself, then compare what you produced with the source.

A flashcard is active recall only if you answer before flipping it. A blank sheet of paper after a lecture, a practice exam, or explaining a concept to a friend without notes all count. The common thread is effort: you have to search your memory, and sometimes you come up empty.

That effort is the point. The psychologists Elizabeth and Robert Bjork use the term "desirable difficulties" for learning conditions like testing and spacing that feel slower in the moment but produce better long-term retention. In [their account](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf), the trap is that the easier methods make performance improve quickly during study, so learners mistake that quick improvement for durable learning.

## What does the research say?

The best-known study is Roediger and Karpicke's [2006 paper in *Psychological Science*](https://doi.org/10.1111/j.1467-9280.2006.01693.x). College students read short prose passages (one was about sea otters, one about the sun) and then either reread them or took a recall test with no feedback.

In the first experiment, rereading won on a test five minutes later: 81% recalled versus 75%. Two days later the result had flipped, 68% for the tested group versus 54% for the rereaders. After one week it was 56% versus 42%.

The second experiment is even more striking. Students had four short periods with a passage, used in one of three ways:

| Condition | 5 minutes later | 1 week later |
|---|---|---|
| Study, study, study, study | 83% | 40% |
| Study, study, study, test | 78% | 56% |
| Study, test, test, test | 71% | 61% |

The repeated-study group read the passage about 14 times in total; the repeated-test group read it about 3 times. The repeated-study group also predicted they would remember it best. They were wrong by a wide margin.

This is not a one-off. A [2013 review by Dunlosky and colleagues](https://doi.org/10.1177/1529100612453266) evaluated ten common study techniques and gave only two a "high utility" rating: practice testing and distributed practice (spacing). Rereading, highlighting and summarization were among the five rated low utility. A [2014 meta-analysis by Rowland](https://doi.org/10.1037/a0037559) pooled 159 effect sizes from 61 studies and found a reliable advantage for testing over restudying (an average effect size of g = 0.50). The advantage was larger when the final test came at least a day later, and larger when people got feedback after their practice attempts.

It is not only about rote facts. In a [2011 study in *Science*](https://doi.org/10.1126/science.1199327), Karpicke and Blunt had 200 students learn science texts either by building concept maps or by practicing recall. A week later the recall group scored about [50% higher](https://www.sciencedaily.com/releases/2011/01/110121111216.htm), including on questions that required inference, even though most students had predicted concept mapping would work better.

The limits are worth knowing. Most of this research uses college students and text or word lists, and the benefit shows up mainly at delays of a day or more. If your test is in ten minutes, rereading is fine. For anything you want to keep, it is not.

## Why do rereading and highlighting feel like they work?

Because they make the material feel fluent. On the second or third read, sentences go down easily and nothing surprises you, and that ease is easy to mistake for knowing it. The Bjorks call this an "illusion of comprehension." Rereading trains recognition ("yes, I have seen this"); exams and real life usually ask for recall ("what was it?").

It is also what most people do. In a [survey of 177 college students](https://doi.org/10.1080/09658210802647009), 84% listed rereading as a study strategy and 55% said it was their number one strategy. Only 11% described practicing recall.

Highlighting has the same problem. Dunlosky's review found it does little for most learners in most situations, may help a little for people who already know what to highlight, and may even hurt performance on tasks that require drawing inferences.

## How do you practice active recall?

You don't need an app. Pick one of these and use it today.

1. **Blurting (the blank page).** After a reading session, close everything and write down all you remember for five to ten minutes, in any order. Then open the source and fill the gaps in a different color. The gaps are your study list for next time.
2. **Question-first notes.** Instead of copying statements, write your notes as questions in the margin ("What happened to the rereaders after one week?") with the answers to the side. Later, cover the answers and work through the questions.
3. **Self-quizzing and flashcards.** Answer each card out loud or on paper before flipping it. Keep one idea per card. Mix in "why" and "how" cards, not just definitions. Put the cards you miss back in the pile.
4. **Explain it without notes.** Teach the idea to a friend, or to an imagined 12-year-old, from memory. Where you stall or reach for jargon is where your understanding is thin. This is often sold as the "Feynman technique," though the name was [popularized online around 2011](https://learning.subwiki.org/wiki/Feynman_technique), not by Feynman. The closest researched technique, self-explanation, was rated moderate utility in the Dunlosky review.
5. **Practice problems.** For math, code, or anything procedural, work problems without looking at the worked example first.

A few rules make any of these work better:

- **Check your answers.** Feedback roughly doubled the testing benefit in Rowland's meta-analysis (g = 0.73 with feedback versus 0.39 without).
- **Retrieve before you feel ready.** Struggling and getting some wrong is part of it.
- **Space it out.** One recall session helps; several spread over days and weeks help much more. See [how spaced repetition works](/blog/spaced-repetition) for a schedule.

## Active recall vs passive review

| | Passive review | Active recall |
|---|---|---|
| Examples | Rereading, highlighting, rewatching | Blank-page recall, self-quizzing, explaining |
| How it feels | Smooth, productive | Effortful, sometimes frustrating |
| What it trains | Recognizing the material | Producing it when you need it |
| Best for | A test in the next few minutes | Anything you want to remember next week |

## Using active recall beyond studying

The same principle applies to the articles, videos and podcasts you consume for work or curiosity. Most of it fades because you never retrieve it. The [forgetting curve](/blog/forgetting-curve) is steep for anything you meet once and never revisit.

- **After an article:** close the tab, then write two or three sentences on what it argued and one thing you would push back on.
- **During a video:** pause at the end of each section and say the main point out loud. In a [Harvard study of a 21-minute online statistics lecture](https://doi.org/10.1073/pnas.1221764110), students who got short quizzes between segments reported mind wandering on 19% of probes, versus about 40% for the untested groups, and scored 90% on the final test versus 76% and 68%. It was a single lecture in a lab setting, so treat it as a strong hint, not settled law.
- **With things you saved:** when you come back to a saved post, try to recall what it said and why you saved it before you open it.

There is a fuller method for each format in [how to remember what you read](/blog/how-to-remember-what-you-read).

## Doing this with Machina

Machina won't do the recalling for you, and nothing should. What it can do is set up the moments where recall happens. Every save gets a summary and key concepts, and a Smart review reminder brings a save back the next day, a week after that and a month after that. When one comes up, try to state the main idea before you tap it, then check yourself against the summary.

Ask Machina is useful as a check. Answer a question yourself first ("what were the three arguments in that pricing article?"), then ask Machina, which answers from your own saves and cites the exact saves it used. You can write your own recall into a card's notes; notes are searchable, and Ask uses them.

[Machina](/) is free to start on iPhone and the web.`,
};

export default post;
