/**
 * The public FAQ (`/faq`, also the FAQPage JSON-LD there and a section of
 * `/llms-full.txt`). Answers are plain text so they work in all three places.
 * Every answer must stay true to the shipped product and the privacy policy;
 * prices are the decided plan in `SOURCE_OF_TRUTH.md` §7.1.
 */
export const FAQ: { q: string; a: string }[] = [
    {
        q: 'What is Machina?',
        a: 'Machina is an AI second brain for everything you save. You send it links, screenshots, videos and notes from any app, and it reads each one, writes a summary, files it with a category and tags, and connects it to what you saved before. Later you can search by meaning or ask a question and get an answer drawn from your own saves, with citations.',
    },
    {
        q: 'How do I save things to Machina?',
        a: 'On iPhone, tap Share in any app (Safari, YouTube, X, Instagram, TikTok, Reddit, Photos, WhatsApp and so on) and choose Machina. It takes two taps and works whether or not Machina is open. On the web, paste a link. You can also write a note and save it as its own card.',
    },
    {
        q: 'What can I save?',
        a: 'Links to articles and posts, YouTube and social videos, screenshots (several screenshots can go on one card), photos, and your own notes. Each save becomes a card with a summary, a category, tags, key concepts and links to related saves.',
    },
    {
        q: 'How is Machina different from bookmarks or a read-later app?',
        a: 'Bookmarks and read-later apps keep a list of things you have not read yet. Machina reads them for you: every save comes back summarized, organized and connected, so a save is useful the moment you make it. You find things by asking or searching by meaning instead of remembering where you put them, and a Smart review reminder brings a save back the next day, a week after that and a month after that.',
    },
    {
        q: 'What does "Ask Machina" do?',
        a: 'You ask a question in plain language, such as "what did I save about sleep?", and Machina answers from your own saves only, with citations that link back to the exact saves it used. It does not answer from the open internet, so you can check every claim against the source.',
    },
    {
        q: 'Does Machina help me remember what I save?',
        a: 'Yes. It uses two ideas from learning science: spaced repetition, through Smart review reminders that bring a save back the next day, a week after that and a month after that, and active recall, through asking questions of your own library. A weekly synthesis every Sunday sums up what you saved and how it connects.',
    },
    {
        q: 'Which devices does Machina work on?',
        a: 'Machina has an iPhone app and a web app at mymachina.app that works in any modern browser on a Mac or PC. Both show the same library, so something saved on your phone in the morning is on your laptop that afternoon. There is no Android app yet.',
    },
    {
        q: 'How much does Machina cost?',
        a: 'Machina is free to start. The free plan includes 50 saves and 20 questions a month, with search, collections, reminders and sharing. Machina Pro removes those limits and adds full weekly syntheses, digests and YouTube video analysis, for $7.99 a month or $49.99 a year in the US. Every new account gets Pro free for its first 14 days, with no card required and nothing to cancel.',
    },
    {
        q: 'Is my data private?',
        a: 'Machina has no ads and no tracking, and never sells your data. Your content is never used to train AI models: summaries and answers are written with the paid Google Gemini API, under terms that do not allow Google to train on what you send. You sign in with Apple or Google and can delete your account and everything in it from Settings at any time. The full details are in the privacy policy at mymachina.app/privacy.',
    },
    {
        q: 'Can I share what I save?',
        a: 'Yes. You can share a single card, a whole collection, or an answer from Ask Machina as a public link that anyone can open without an account.',
    },
    {
        q: 'Does Machina work in languages other than English?',
        a: 'Yes. Machina reads saves in other languages, and right-to-left languages such as Hebrew display correctly.',
    },
];
