import type { Post } from '../types';

const post: Post = {
    slug: 'read-later-app-vs-second-brain',
    title: 'Read-later apps vs. a second brain: which do you need?',
    description:
        'Bookmarks, read-later apps and a second brain do different jobs. How they differ, the best Pocket alternatives, and how to stop read later becoming read never.',
    date: '2026-10-26',
    category: 'Second brain',
    keywords: [
        'read later app',
        'pocket alternative',
        'bookmarks vs second brain',
        'read later vs second brain',
        'best read it later app',
        'pocket shut down',
    ],
    faq: [
        {
            q: 'Is Pocket still available?',
            a: 'No. Mozilla shut Pocket down on July 8, 2025, and said exported data was available until October 8, 2025, after which it would be permanently deleted.',
        },
        {
            q: 'What is the best Pocket alternative?',
            a: 'For a close replacement, Instapaper is the simplest and has a free plan, and Readwise Reader is the most powerful for heavy readers. If you used Pocket mostly to keep things rather than read them, a second brain app is a better fit.',
        },
        {
            q: 'Is Safari Reading List a good read-later app?',
            a: 'For light use, yes. It is free, built into iPhone, and can save pages for offline reading. It is a simple list, so heavy readers who want highlighting and notes usually move to a dedicated app.',
        },
        {
            q: 'Can a second brain replace a read-later app?',
            a: 'For many people, yes, especially if most of what you save is short or not text, like videos, screenshots and posts. If you read several long articles a day and highlight them, keep a dedicated reader and send the best parts to your second brain.',
        },
    ],
    body: `A bookmark saves *where* something is. A read-later app saves something you plan to read soon, in a clean format. A second brain saves what you want to *keep and use* later, so you can find it, connect it to other things and act on it. If you read long articles daily, you want a read-later app; if you save a mix of links, posts, videos and screenshots to come back to, you want a second brain.

## The short version

- **Bookmarks** are addresses. Good for sites you revisit, bad for remembering why you saved something.
- **Read-later apps** (Instapaper, Readwise Reader) are a queue of articles to read. They work when you actually work through the queue.
- **A second brain** is a library of things worth keeping, organized so you can find and reuse them. More on that in [what is a second brain](/blog/what-is-a-second-brain).
- Pocket, the best-known read-later app, shut down in July 2025.
- Most read-later lists fail the same way: saving is easy, reading is not, and the list grows until you stop opening it.

## What is the difference between bookmarks, read-later apps and a second brain?

| | Bookmarks | Read-later app | Second brain |
| --- | --- | --- | --- |
| What it holds | Links | Articles to read | Anything worth keeping |
| The promise | "I can go back" | "I will read this" | "I can find and use this" |
| What happens after | You return to the page | You read, then archive | You search, connect, reuse |
| Typical content | Sites, tools, docs | Long articles, newsletters | Links, posts, videos, screenshots, notes |
| Fails when | You forget why you saved it | The queue gets too long | Organizing it is too much work |
| Examples | Browser bookmarks, Raindrop.io | Instapaper, Readwise Reader, Safari Reading List | Notion, Obsidian, mymind, Machina |

The key difference is the **job after saving**. A read-later item is meant to be consumed and then archived. A second-brain item is meant to stay useful: the recipe you will cook again, the framework you will cite in a meeting, the screenshot of a book recommendation.

## What happened to Pocket?

Pocket started in 2007 as a Firefox extension called Read It Later and was acquired by Mozilla in 2017 ([Wikipedia](https://en.wikipedia.org/wiki/Pocket_(service))). On May 22, 2025, Mozilla [announced it was shutting Pocket down](https://blog.mozilla.org/en/mozilla/building-whats-next/): the service ended on July 8, 2025, and users could export their saves until October 8, 2025, after which their data would be permanently deleted. Mozilla's stated reason was that the way people save and consume content on the web has changed.

Pocket was not the only casualty. Omnivore, a free open-source read-later app, [shut down its hosted service in November 2024](https://heise.de/-9998733) after its team joined ElevenLabs.

If you used Pocket and did not export in time, those saves are gone. If you did export, most alternatives accept the file: Readwise Reader, for example, [lets you upload a Pocket export](https://readwise.io/read).

## What are the best read-later apps now?

As of October 2026:

- **[Instapaper](https://www.instapaper.com/premium)** is the closest thing to classic Pocket. The free plan saves unlimited articles and syncs across web, iOS and Android. Premium, at $5.99/month or $59.99/year, adds full-text search, a permanent archive, a PDF reader, unlimited notes and text-to-speech playlists.
- **[Readwise Reader](https://readwise.io/read)** is the power-reader option. It handles articles, newsletters, RSS, PDFs, EPUBs, YouTube transcripts and X threads, has strong highlighting and an AI assistant called Ghostreader, and exports highlights to Obsidian and Notion. [Pricing](https://readwise.io/pricing) is $7.99/month for Reader alone, billed yearly, after a 30-day trial.
- **[Safari Reading List](https://support.apple.com/guide/iphone/save-pages-to-a-reading-list-iph1a4721132/ios)** is free and already on your iPhone. You can add a page from the share menu or by holding a link, and turn on automatic offline saving in Settings.

If what you want is a reading queue, any of these will do the job. Pick Instapaper for simplicity, Reader if you highlight a lot, and Reading List if you save a few articles a week.

## Why does "read later" so often become "read never"?

Saving takes one tap. Reading a long article takes real, uninterrupted time you have to find. So the list grows faster than it shrinks, and once it is long enough, opening it feels like opening an overdue inbox.

Even at its peak, Pocket's own numbers suggested a big gap. In 2013, Pocket's editorial director told the *American Journalism Review* that users revisit [about half of all saved content](https://ajrarchive.org/Article.asp?id=5525). That is a company figure without published methodology, and "revisit" is not the same as "read," but it implies that a large share of saves were never reopened at all.

The habit is older than the internet. Japanese has a word, *tsundoku*, for buying books and letting them pile up unread; it dates from the Meiji era ([Wikipedia](https://en.wikipedia.org/wiki/Tsundoku)). Christian Tietze calls the digital version the [collector's fallacy](https://zettelkasten.de/posts/collectors-fallacy/): saving feels like progress, but knowing about something is not knowing it.

There is a second, quieter problem. Much of what people save today is not an article. It is a reel with a recipe, a TikTok with a travel tip, a screenshot of a book, a thread. Read-later apps are built for text you sit down and read; they are a poor fit for things you want to *find again* when you need them. That is often why people say their saved posts disappear into a void (we wrote a whole piece on [why you never look at saved posts again](/blog/why-you-never-look-at-saved-posts-again)).

## Which one do you need?

**You need bookmarks if** you return to the same sites and tools: your bank, a documentation page, a favorite shop. Your browser already does this.

**You need a read-later app if** you regularly read long articles and newsletters, you set aside time to read, and you mostly want a clean, distraction-free queue. You read, maybe highlight, then archive.

**You need a second brain if** you save things to *use* later rather than to read once: recipes, places, products, ideas for work, advice from videos. Also if a lot of what you save comes from social apps, is visual, or is a screenshot.

**Many people need both.** A common setup is a read-later app as the reading queue and a second brain as the library, where only the articles worth keeping end up, with your highlights and a note on why.

## How do you keep a read-later list from turning into a graveyard?

These work with any app:

1. **Cap the list.** Pick a number, like 30. When you hit it, you cannot add without deleting or reading something.
2. **Triage weekly.** Once a week, go through new saves: read, archive or delete. Deleting is allowed; most saves were impulses.
3. **Note why you saved it.** One line ("for the pricing doc," "try this weekend") tells future you whether it is still relevant.
4. **Separate reading from keeping.** When you finish something worth keeping, move the useful part (a quote, a takeaway) to your notes or second brain, then archive the article.
5. **Read in a fixed slot.** Twenty minutes with coffee works better than "whenever I have time," which never comes.

If you want what you read to stick, not just get checked off, see [how to remember what you read](/blog/how-to-remember-what-you-read).

## Doing this automatically with Machina

[Machina](/) is a second brain for people who save more than they read. You save from the iOS share sheet in any app, such as Safari, YouTube, Instagram, TikTok, X or Reddit, in two taps; on the web you paste a link. Instead of adding to a queue, Machina reads each save for you and writes a real summary, tags and key concepts, so you get the gist even if you never open the original. A long YouTube video becomes a few key points with timestamps, and screenshots become searchable text.

When you need something, you search by meaning or ask a question and get an answer from your own saves, with citations to the exact saves it used. And instead of a list that grows silently, saves come back: a Smart review reminder resurfaces a save the next day, a week later and a month later, and a weekly synthesis arrives on Sundays. Machina is not built as a dedicated reading app, so if you read long articles every day, pairing it with Instapaper or Readwise Reader makes sense.

[Machina](/) is free to start on iPhone and the web.`,
};

export default post;
