/**
 * The demo account the reel captures: one curious person's saves, rendered by
 * the REAL app (see capture/build-app.mjs). This file is data only. It seeds
 * the in-memory Firestore (shims/seed.ts), scripts the backend answers the
 * capture server gives (Ask, search, the save pipeline), and is read by
 * `npm run verify`, which checks every string here the way it checks captions.
 *
 * WHAT THE CARDS ARE. Real things worth saving, from real publishers, with
 * summaries written to be TRUE to the source (a card's summary is the app's
 * read of that page, so a wrong one would be a lie the app never tells).
 * Titles are the published titles. Two concessions, both deliberate:
 *  - Instagram handles are invented: a real account never posted these
 *    carousels, and putting words in a real person's feed is worse than an
 *    obviously ordinary handle. X and YouTube bylines ARE real, because the
 *    thread and the videos are theirs.
 *  - No third-party images anywhere (brand rule): every card renders without
 *    a cover, which is also how the app shows a card whose image is hidden.
 *
 * HOUSE RULES, enforced by `npm run verify`: no literal "AI" and no "second
 * brain" (docs/BRANDING.md D-3), no em dashes (the app-wide ban), and the word
 * "library" nowhere a viewer can read it.
 *
 * THE THREADS THE REEL PULLS ON:
 *  - Ask: "What do my saves say about time?" is answered from three saves on
 *    three platforms (a Wait But Why essay, a TED talk on YouTube, a thread
 *    on X) that the graph also clusters together.
 *  - Find: "easy dinner, empty fridge" shares NO word with the
 *    one card it lands on (Marcella Hazan's three-ingredient sauce), which is
 *    the only way a search beat proves it understood rather than matched.
 *  - Save: the Tail End is the card the reel watches get saved, and the same
 *    card is then cited in the Ask answer, so the reel is one continuous day.
 *  - Revisit: today's Daily Brew deals five older saves nobody has opened in
 *    weeks.
 */

export const CAPTURE_USER = {
  uid: 'reel-demo',
  email: 'jordan@example.com',
  displayName: 'Jordan Lee',
};

const DAY = 86_400_000;

/**
 * `age` is days before "now" at capture time, so relative labels ("3d ago")
 * are stable whatever day the capture runs.
 */
export const CARDS = [
  {
    id: 'tailend',
    url: 'https://waitbutwhy.com/2015/12/the-tail-end.html',
    title: 'The Tail End',
    summary:
      'Counted in visits instead of years, the time left with the people you love is smaller than it feels. By the end of high school, most of your in-person time with your parents is already behind you.',
    category: 'Family',
    tags: ['time', 'parents', 'perspective'],
    concepts: ['time', 'relationships', 'mortality'],
    sourceType: 'web',
    sourceName: 'Wait But Why',
    readTime: 7,
    // saved moments ago: the Save beat saves it, every later beat sees it new
    age: 0,
    status: 'unread',
    // what the card holds once it is read: the open view's Key Points and
    // its one "Do this" line (the Save beat opens it to show that)
    detail: [
      '## Key Points',
      '- Counted in visits, most people have spent over 90% of their in-person time with their parents by the end of high school.',
      '- The same math holds for siblings and old friends once you no longer share a city.',
      '- So: live near the people you love, and treat time together as the scarce thing it is.',
    ].join('\n'),
    takeaway: 'Call your parents this week, and put the next visit on the calendar.',
  },
  {
    id: 'piranesi',
    url: 'capture://screenshot/piranesi.png',
    title: 'Read Piranesi, and go in blind',
    summary:
      "Sam's pick: Susanna Clarke's short, strange novel about a man who lives in a house of endless halls and tides. Best read knowing nothing about it.",
    category: 'Books',
    tags: ['novels', 'from-sam'],
    concepts: ['fiction', 'recommendation'],
    sourceType: 'image',
    sourceName: 'Screenshot',
    readTime: 1,
    age: 2,
    status: 'unread',
    note: 'Sam says do not read the back cover.',
  },
  {
    id: 'goloritze',
    url: 'https://www.instagram.com/slowcoasts/',
    title: 'Cala Goloritzé, Sardinia',
    summary:
      'A white-pebble cove under a limestone spire, reachable only on foot or by boat. The trail down from the Golgo plateau takes about an hour, so start early.',
    category: 'Travel',
    tags: ['sardinia', 'beaches', 'hikes'],
    concepts: ['travel', 'hiking'],
    sourceType: 'web',
    sourceName: '@slowcoasts',
    readTime: 2,
    age: 5,
    status: 'unread',
  },
  {
    id: 'procrastinator',
    url: 'https://www.youtube.com/watch?v=arj7oStGLkU',
    title: 'Inside the mind of a master procrastinator',
    summary:
      'The Instant Gratification Monkey, the Panic Monster, and the rational decision-maker who keeps losing the wheel. Deadlines rescue us; the goals with no deadline are the ones that quietly never happen.',
    category: 'Psychology',
    tags: ['procrastination', 'habits', 'time'],
    concepts: ['procrastination', 'time', 'deadlines'],
    sourceType: 'youtube',
    sourceName: 'YouTube',
    youtubeChannel: 'TED',
    readTime: 14,
    age: 9,
    status: 'unread',
  },
  {
    id: 'marcella',
    url: 'https://cooking.nytimes.com/recipes/1015178-marcella-hazans-tomato-sauce',
    title: "Marcella Hazan's tomato sauce",
    summary:
      'Three ingredients, one pot: a can of whole tomatoes, five tablespoons of butter and a halved onion. Simmer 45 minutes, discard onion, salt to taste.',
    category: 'Recipes',
    tags: ['pasta', 'italian', 'weeknight'],
    concepts: ['cooking', 'recipe'],
    sourceType: 'web',
    sourceName: 'NYT Cooking',
    readTime: 3,
    age: 12,
    status: 'favorite',
    note: 'Make this Sunday. Double it.',
    // the card's "Do this" (only saves that call for an action carry one,
    // as in the app; the Revisit beat lists the open ones)
    takeaway: 'Make it this Sunday: one can of tomatoes, five tablespoons of butter, one onion.',
    recipe: {
      ingredients: [
        '1 can (28 oz) whole peeled tomatoes',
        '5 tablespoons unsalted butter',
        '1 medium onion, peeled and halved',
        'Salt',
      ],
      instructions: [
        'Put the tomatoes, butter and onion halves in a heavy saucepan over medium heat.',
        'Bring to a simmer, then cook uncovered for about 45 minutes, stirring now and then and crushing the tomatoes against the side of the pot.',
        'Discard the onion and salt to taste.',
      ],
      servings: '4',
      cook_time: '45 min',
    },
  },
  {
    id: 'yoga',
    url: 'https://www.youtube.com/watch?v=v7AYKMP6rOE',
    title: 'Yoga For Complete Beginners, 20 Minute Home Yoga Workout',
    summary:
      'Twenty minutes, no experience needed: breath first, then the basic shapes, at an easy pace you can repeat every morning.',
    category: 'Wellness',
    tags: ['yoga', 'mornings'],
    concepts: ['exercise', 'routine'],
    sourceType: 'youtube',
    sourceName: 'YouTube',
    youtubeChannel: 'Yoga With Adriene',
    readTime: 23,
    age: 16,
    status: 'unread',
  },
  {
    id: 'naval',
    url: 'https://x.com/naval/status/1002103360646823936',
    title: 'How to Get Rich (without getting lucky)',
    summary:
      'Seek wealth, not money or status. Build specific knowledge, take accountability, use leverage, and play iterated games: the returns in life come from compound interest.',
    category: 'Career',
    tags: ['wealth', 'leverage', 'long-term'],
    concepts: ['compounding', 'time', 'career'],
    sourceType: 'web',
    sourceName: '@naval',
    readTime: 6,
    age: 21,
    status: 'unread',
  },
  {
    id: 'systems',
    url: 'https://x.com/JamesClear',
    title: 'You do not rise to the level of your goals',
    summary:
      'You fall to the level of your systems. Small habits, repeated, compound into results that goals alone never reach.',
    category: 'Habits',
    tags: ['habits', 'systems'],
    concepts: ['habits', 'compounding'],
    sourceType: 'web',
    sourceName: '@JamesClear',
    readTime: 1,
    age: 26,
    status: 'unread',
  },
  {
    id: 'chicken',
    url: 'https://cooking.nytimes.com/recipes/1018731-buttermilk-marinated-roast-chicken',
    title: "Samin Nosrat's buttermilk-brined roast chicken",
    summary:
      'Salt the chicken, let it sit overnight in buttermilk, then roast it hot. The buttermilk tenderizes the meat and its sugars brown into a burnished skin.',
    category: 'Recipes',
    tags: ['chicken', 'sunday'],
    concepts: ['cooking', 'recipe'],
    sourceType: 'web',
    sourceName: 'NYT Cooking',
    readTime: 4,
    age: 29,
    status: 'unread',
  },
  {
    id: 'optimistic',
    url: 'https://www.youtube.com/watch?v=MBRqu0YOH14',
    title: 'Optimistic Nihilism',
    summary:
      'If the universe has no built-in meaning, the meaning is yours to make. A short, bright case for enjoying the one life you get instead of despairing over it.',
    category: 'Philosophy',
    tags: ['meaning', 'perspective'],
    concepts: ['meaning', 'time', 'mortality'],
    sourceType: 'youtube',
    sourceName: 'YouTube',
    youtubeChannel: 'Kurzgesagt',
    readTime: 6,
    age: 31,
    status: 'unread',
  },
  {
    id: 'question',
    url: 'https://markmanson.net/question',
    title: 'The Most Important Question of Your Life',
    summary:
      'Everybody wants the rewards. Mark Manson on the question that shapes a life: what pain are you willing to sustain? Choose the struggle you can live with, and the result follows.',
    category: 'Career',
    tags: ['purpose', 'motivation'],
    concepts: ['work', 'purpose', 'career'],
    sourceType: 'web',
    sourceName: 'Mark Manson',
    readTime: 8,
    age: 34,
    status: 'unread',
  },
  {
    id: 'tinydesk',
    url: 'https://www.youtube.com/watch?v=ferZnZ0_rSM',
    title: 'Anderson .Paak & The Free Nationals: Tiny Desk Concert',
    summary:
      'Anderson .Paak sings from behind the drum kit with the Free Nationals, squeezed in among the desks at NPR for a joyful fifteen-minute set.',
    category: 'Music',
    tags: ['live', 'soul'],
    concepts: ['music', 'performance'],
    sourceType: 'youtube',
    sourceName: 'YouTube',
    youtubeChannel: 'NPR Music',
    readTime: 16,
    age: 38,
    status: 'unread',
  },
  {
    id: 'rams',
    url: 'https://www.vitsoe.com/us/about/good-design',
    title: "Dieter Rams: ten principles for good design",
    summary:
      'Good design is innovative, useful, aesthetic, understandable, unobtrusive, honest, long-lasting, thorough down to the last detail, environmentally friendly, and as little design as possible.',
    category: 'Design',
    tags: ['design', 'principles'],
    concepts: ['design', 'craft'],
    sourceType: 'web',
    sourceName: 'Vitsœ',
    readTime: 6,
    age: 45,
    status: 'unread',
  },
  {
    id: 'bretvictor',
    url: 'https://vimeo.com/36579366',
    title: 'Inventing on Principle',
    summary:
      'Creators need an immediate connection to what they make. Bret Victor demos tools that show the result of every change instantly, then argues for living by a principle.',
    category: 'Design',
    tags: ['talks', 'tools', 'craft'],
    concepts: ['design', 'craft', 'work'],
    sourceType: 'web',
    sourceName: 'Vimeo',
    readTime: 54,
    age: 52,
    status: 'unread',
  },
  {
    id: 'jobs',
    url: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
    title: "Steve Jobs' 2005 Stanford Commencement Address",
    summary:
      'Three stories: connecting the dots, love and loss, and death. You can only connect the dots looking backwards, so you have to trust that they will connect.',
    category: 'Talks',
    tags: ['career', 'life'],
    concepts: ['work', 'mortality', 'meaning'],
    sourceType: 'youtube',
    sourceName: 'YouTube',
    youtubeChannel: 'Stanford',
    readTime: 15,
    age: 63,
    status: 'unread',
  },
  {
    id: 'gift',
    url: '',
    title: 'Birthday idea for Dana',
    summary:
      'The ceramic pour-over set she picked up twice at the Saturday market. The stall is only there on weekends.',
    category: 'Gifts',
    tags: ['dana', 'birthdays'],
    concepts: ['gift'],
    sourceType: 'note',
    readTime: 1,
    age: 70,
    status: 'unread',
  },
  {
    id: 'fourthousand',
    url: 'https://www.oliverburkeman.com/books',
    title: 'Four Thousand Weeks',
    summary:
      'The average human life lasts about four thousand weeks. Oliver Burkeman on why you will never get it all done, and why choosing what to neglect is the whole skill.',
    category: 'Books',
    tags: ['time', 'finitude'],
    concepts: ['time', 'mortality', 'attention'],
    sourceType: 'web',
    sourceName: 'Oliver Burkeman',
    readTime: 5,
    age: 4,
    status: 'unread',
  },
  {
    id: 'perfectdays',
    url: 'https://www.youtube.com/@NEON',
    title: 'Perfect Days',
    summary:
      'Wim Wenders follows a Tokyo toilet cleaner through his quiet routines: cassettes, paperbacks, trees and light. A film about finding enough in an ordinary day.',
    category: 'Film',
    tags: ['film', 'slow-living'],
    concepts: ['time', 'attention', 'routine'],
    sourceType: 'youtube',
    sourceName: 'YouTube',
    youtubeChannel: 'NEON',
    readTime: 2,
    age: 7,
    status: 'unread',
  },
  {
    id: 'webb',
    url: 'https://www.instagram.com/nasawebb/',
    title: 'Cosmic Cliffs in the Carina Nebula',
    summary:
      "Webb's infrared view of the edge of a young star-forming region in Carina. The mountains are gas and dust, and the tallest peaks are about seven light-years high.",
    category: 'Space',
    tags: ['webb', 'nebulae'],
    concepts: ['space', 'perspective'],
    sourceType: 'web',
    sourceName: '@nasawebb',
    readTime: 1,
    age: 11,
    status: 'unread',
  },
  {
    id: 'coffee',
    url: 'https://www.youtube.com/@jameshoffmann',
    title: 'The Ultimate V60 Technique',
    summary:
      "Bloom with twice the coffee's weight in water and swirl, pour the rest in two stages, then one gentle swirl for a flat bed. Done in about three and a half minutes.",
    category: 'Coffee',
    tags: ['pour-over', 'mornings'],
    concepts: ['coffee', 'routine'],
    sourceType: 'youtube',
    sourceName: 'YouTube',
    youtubeChannel: 'James Hoffmann',
    readTime: 9,
    age: 19,
    status: 'unread',
    takeaway: 'Tomorrow morning, try the two-stage pour with a 45-second bloom.',
  },
  {
    id: 'money',
    url: 'https://collabfund.com/blog/the-psychology-of-money/',
    title: 'The Psychology of Money',
    summary:
      'Twenty flaws, biases and causes of bad behavior people show with money. The thread through all of them: how you behave with money matters more than how much you know.',
    category: 'Money',
    tags: ['money', 'behavior'],
    concepts: ['wealth', 'compounding', 'behavior'],
    sourceType: 'web',
    sourceName: 'Collaborative Fund',
    readTime: 18,
    age: 24,
    status: 'unread',
  },
  {
    id: 'lawsofux',
    url: 'https://lawsofux.com/',
    title: 'Laws of UX',
    summary:
      "A tidy collection of design heuristics, from Fitts's law to Hick's law and the peak-end rule, each with a one-line takeaway you can bring to a review.",
    category: 'Design',
    tags: ['ux', 'heuristics'],
    concepts: ['design', 'psychology'],
    sourceType: 'web',
    sourceName: 'Laws of UX',
    readTime: 8,
    age: 41,
    status: 'unread',
  },
  {
    id: 'tmb',
    url: 'https://www.autourdumontblanc.com/',
    title: 'Tour du Mont Blanc',
    summary:
      'About 170 km around the Mont Blanc massif through France, Italy and Switzerland, usually walked in ten to twelve days from refuge to refuge. Book the huts early.',
    category: 'Outdoors',
    tags: ['hiking', 'alps'],
    concepts: ['hiking', 'travel'],
    sourceType: 'web',
    sourceName: 'Autour du Mont Blanc',
    readTime: 6,
    age: 47,
    status: 'unread',
  },
  {
    id: 'fushimi',
    url: 'https://www.instagram.com/earlytrains/',
    title: 'Fushimi Inari at dawn',
    summary:
      'Thousands of vermilion torii gates climbing Mount Inari in Kyoto. Arrive before seven and the upper trail is almost empty.',
    category: 'Travel',
    tags: ['kyoto', 'japan'],
    concepts: ['travel', 'hiking'],
    sourceType: 'web',
    sourceName: '@earlytrains',
    readTime: 1,
    age: 57,
    status: 'unread',
  },
];

/**
 * Connections, as the graph draws them (each becomes a `relatedLinks` entry on
 * BOTH cards). Three islands on purpose: time and how to spend it (the Ask
 * answer's three sources sit here), making things (work and design), and the
 * kitchen. `reason` is what the app shows on the card's "Connected" row.
 */
export const EDGES = [
  ['tailend', 'procrastinator', 'Both measure a life in the time you have left.', ['time']],
  ['tailend', 'fourthousand', 'Both count a life in finite units of time.', ['time', 'mortality']],
  ['tailend', 'optimistic', 'A short life as a reason to spend it well.', ['time', 'mortality']],
  ['tailend', 'perfectdays', 'Paying attention to the days you have.', ['time']],
  ['tailend', 'jobs', 'Mortality as the thing that clarifies what matters.', ['mortality']],
  ['naval', 'tailend', 'Time as the thing that compounds.', ['time']],
  ['fourthousand', 'procrastinator', 'What to let slide when you cannot do it all.', ['time']],
  ['fourthousand', 'optimistic', 'Finitude as a kind of freedom.', ['meaning']],
  ['perfectdays', 'fourthousand', 'An ordinary day, fully lived.', ['attention']],
  ['procrastinator', 'systems', 'What gets done without a deadline.', ['habits']],
  ['naval', 'systems', 'Small repeated actions that compound.', ['compounding']],
  ['money', 'naval', 'Wealth as behavior, not luck.', ['wealth']],
  ['money', 'systems', 'Small choices, repeated, compound.', ['compounding']],
  ['naval', 'question', 'Choosing the game you are willing to play for years.', ['career']],
  ['question', 'jobs', 'Do what you love, and keep choosing it.', ['work']],
  ['question', 'bretvictor', 'Finding the cause worth struggling for.', ['work', 'craft']],
  ['bretvictor', 'rams', 'Tools and objects that respect the person using them.', ['design']],
  ['lawsofux', 'rams', 'Principles for designing what people use.', ['design']],
  ['lawsofux', 'bretvictor', 'Designing for the person on the other side.', ['design']],
  ['rams', 'jobs', 'Simplicity as the hardest craft.', ['design']],
  ['optimistic', 'jobs', 'Meaning you make yourself.', ['meaning']],
  ['webb', 'optimistic', 'The universe, and how small we are in it.', ['perspective']],
  ['tinydesk', 'jobs', 'People at their most human on a small stage.', ['performance']],
  ['marcella', 'chicken', 'Weeknight cooking from a few ingredients.', ['recipe']],
  ['coffee', 'gift', 'The pour-over set, and how to use it.', ['coffee']],
  ['coffee', 'yoga', 'A slower start to the morning.', ['routine']],
  ['chicken', 'coffee', 'Sunday at home.', ['routine']],
  ['tmb', 'goloritze', 'Trails worth planning a trip around.', ['hiking']],
  ['tmb', 'fushimi', 'Walks best started at first light.', ['hiking']],
  ['fushimi', 'goloritze', 'Places best seen before the crowds.', ['travel']],
];

export const COLLECTIONS = [
  {
    id: 'time',
    name: 'Time well spent',
    color: 'indigo',
    cards: ['tailend', 'procrastinator', 'fourthousand', 'naval', 'optimistic', 'systems', 'perfectdays'],
    age: 40,
  },
  {
    id: 'cook',
    name: 'Cook this week',
    color: 'orange',
    cards: ['marcella', 'chicken', 'coffee'],
    age: 30,
  },
  {
    id: 'design',
    name: 'Design that lasts',
    color: 'teal',
    cards: ['rams', 'bretvictor', 'lawsofux', 'jobs'],
    age: 60,
  },
  {
    id: 'trips',
    name: 'Trips to take',
    color: 'blue',
    cards: ['goloritze', 'tmb', 'fushimi'],
    age: 50,
  },
  {
    id: 'weekend',
    name: 'Weekend plans',
    color: 'green',
    cards: ['yoga', 'gift', 'piranesi', 'tinydesk'],
    age: 20,
  },
];

/** Today's Daily Brew: five older saves nobody has opened in weeks. */
export const DAILY_BREW = ['question', 'rams', 'jobs', 'bretvictor', 'optimistic'];

/** The Ask exchange (the reel's hero). Three sources, three platforms. */
export const ASK = {
  question: 'What do my saves say about time?',
  answer: [
    'Your saves keep circling one idea: time is shorter than it feels, and it compounds.',
    '',
    'The Tail End counts what is left in visits, not years. Tim Urban’s talk shows why the goals with no deadline are the ones that slip. And Naval’s thread: the returns in life come from compound interest.',
  ].join('\n'),
  sources: ['tailend', 'procrastinator', 'naval'],
};

/** The Find beat. The query shares no word with the one card it lands on. */
export const SEARCH = {
  query: 'easy dinner, empty fridge',
  hits: ['marcella'],
  // The FIND feature clip's searches (clips/find-timeline.mjs), each checked
  // by `npm run verify` against the app's own matcher (web/lib/searchMatch.ts):
  //  - words: shares no word with its one card (the reel's query);
  //  - close: one word ("swim") is on no card, so no card has them all, and
  //    the app's "Close matches" tier offers the one that has the rest (no
  //    other save's title or tags carries any of its words);
  //  - source: where it was saved; the Sources row offers it as you type
  //    (sources match by name only, so the card grid under it is empty),
  //    and one tap shows every save from there;
  //  - takeaway: words again, on a different card (the clip's last search).
  clip: {
    words: { query: 'easy dinner, empty fridge', hits: ['marcella'] },
    close: { query: 'sardinia swim spot', card: 'goloritze' },
    source: { query: 'youtube', source: 'YouTube' },
    // the takeaway (owner 2026-10-21: not the first search again): one more
    // own-words query, sharing no word with its one card
    takeaway: { query: 'red shrine, sunrise', hits: ['fushimi'] },
  },
};

/**
 * This week's "This week in Machina" recap (the app's weekly synthesis,
 * users/{uid}/syntheses/{weekId}): what the server writes on the user's
 * recap day. The Recall beat opens it. Written from the week's real saves
 * (ages 0–7 above); no "learned" framing, it is a recap, not a lesson.
 */
export const SYNTHESIS = {
  title: 'Your week kept coming back to time',
  narrative: [
    'Five saves this week, and three of them are about the same thing: how little time there is, and how to spend it.',
    'The Tail End counts it in visits with your parents. Four Thousand Weeks counts it in weeks, and argues for doing fewer things on purpose. Perfect Days shows what that looks like on an ordinary Tuesday.',
  ].join('\n'),
  themes: [
    {
      title: 'Counting the time that is left',
      insight: 'Two very different writers land on the same arithmetic, and the same answer: spend it on the people and things you would miss.',
      cardIds: ['tailend', 'fourthousand'],
    },
    {
      title: 'Somewhere to be slow',
      insight: 'A film about one quiet routine, a beach you can only reach by boat, and a novel to read in one sitting.',
      cardIds: ['perfectdays', 'goloritze', 'piranesi'],
    },
  ],
  standoutCardId: 'tailend',
  standoutReason: 'The one to reread. It turns an abstract number into Sunday lunches you can still plan.',
  openQuestion: 'If you counted the visits you have left, who would you call this week?',
  cardCount: 5,
};

/**
 * SAVE THIS (clips/savethis-timeline.mjs): the reel's own post, saved from
 * the share sheet, as the app would file it. (owner, round 17: Machina has
 * no Instagram account yet, so the save is the post on X, from the brand's
 * real `@machinaapp`, not a reel from an account that does not exist.) Its cover is the
 * reel's frame 0 (public/clips/savethis/cover.jpg, served to the capture),
 * so the card reads as the video the viewer is watching. The summary is what
 * the post says, in the app's voice; its words "never", "watch" and "again"
 * are why the search finds it literally, with no other card matching. The
 * handle is the brand's (`@machinaapp`, as on X).
 */
export const SAVETHIS = {
  id: 'savethis',
  url: 'https://x.com/machinaapp',
  title: 'You’re going to save this video',
  summary:
    'Most saved posts never get watched again. This one follows a save into Machina, which reads it and finds it again from whatever you remember.',
  category: 'Productivity',
  tags: ['saving', 'memory'],
  concepts: ['memory', 'attention'],
  sourceName: '@machinaapp',
  readTime: 1,
  /** served by the capture server from the static export's root */
  cover: '/capture-savethis-cover.jpg',
  /** the saves younger than this many days are held back until after the
   *  graph (it maps what was saved before it), then join the feed the reel
   *  flicks past (round 7: "But you'll never rewatch them all.") */
  buriedAge: 20,
  /** (rounds 1 to 5) what the viewer remembered of it, typed into Search
   *  your saves; kept for the capture server's search answer */
  query: 'never watch it again',
  hits: ['savethis'],
  /**
   * (owner, round 6: show Ask, not finding; a real question on real saves)
   * Ask Machina, asked about putting things off: the answer is drawn from
   * three saves and says so, each a citation (the proof). Every claim is in
   * its card's summary: Tim Urban's talk (the goals with no deadline quietly
   * never happen), Four Thousand Weeks (choosing what to neglect is the
   * skill) and this reel (most saved posts never get watched again), the
   * last citation, which the reel opens and dives into.
   */
  // (owner, round 12: the answer cites three saves, so the question asks
  // about three: the same three the graph just tied together)
  ask: {
    question: 'What connects my 3 saves about procrastination?',
    answer:
      'All three agree: what has no deadline quietly never happens. Tim Urban’s talk shows why, Four Thousand Weeks says to choose what to neglect, and one video puts it plainly: most saved posts never get watched again.',
    sources: ['procrastinator', 'fourthousand', 'savethis'],
  },
  /**
   * The saves it connects to (owner, round 2: show what the read is FOR): the
   * app's Related cards, with the one-line "why" the graph service writes
   * (its tone, as in EDGES). Both are on what we mean to get back to and
   * what deserves the attention, which is what this post is about. In this
   * take they are dated BEFORE it (they were already saved when it arrives),
   * so they are not among the saves that bury it.
   */
  related: [
    { id: 'procrastinator', age: 23, reason: 'Both about what we mean to come back to, and never do.', common: ['attention'] },
    { id: 'fourthousand', age: 27, reason: 'What to keep, when you can’t keep everything.', common: ['attention'] },
  ],
  /** no cooking content in this reel (owner, 2026-10-02) */
  without: ['marcella', 'chicken'],
  withoutCollections: ['cook'],
};

/**
 * FIND THE BOOK (clips/needle-timeline.mjs): the needle in your saves. The
 * hook dares the viewer to find "the book Sam told you to read" in a field
 * of this account's saves, every one a card the real app rendered; the one it
 * means is `atomichabits` (a screenshot of Sam's text), in plain sight on
 * frame 0. Ask then finds it from the half-remembered question.
 *
 * A haystack needs hay: `extra` adds 32 more saves for this take only (the
 * other videos keep the 24). Same rules as CARDS: real things, published
 * titles, summaries true to the source, invented Instagram handles, no
 * third-party images, nothing on "AI". Several are BOOKS on purpose: they
 * are the decoys the dare is played against.
 */
export const NEEDLE = {
  /** no cooking content (owner, 2026-10-02); (round 2, owner: a book
   *  everyone knows) Sam's book is Atomic Habits, so Piranesi goes (one
   *  "Sam's pick" only) and so do the two James Clear saves (the "systems"
   *  post is a line from the book, and the 2-minute rule is its chapter),
   *  which would read as near-twins of the needle */
  without: ['marcella', 'chicken', 'piranesi', 'systems'],
  withoutCollections: ['cook'],
  /** (moves an existing save's date; the needle carries its own `age`) */
  ages: {},
  /** the needle: Sam's screenshot, saved months ago */
  needle: 'atomichabits',
  ask: {
    question: 'What was the book Sam told me to read?',
    // every claim is on the card: its title, its summary, its note
    answer:
      'Atomic Habits, by James Clear. It’s Sam’s pick, from a screenshot you saved: tiny habits, repeated every day, compound into remarkable results. Sam’s advice: start with the two-minute rule.',
    sources: ['atomichabits'],
  },
  extra: [
    { id: 'robinson', url: 'https://www.youtube.com/@TED', title: 'Do schools kill creativity?', summary: 'Sir Ken Robinson’s funny, moving case that schools educate children out of their creativity, and that it deserves the same status as literacy.', category: 'Education', tags: ['creativity', 'school'], concepts: ['creativity', 'education'], sourceType: 'youtube', sourceName: 'YouTube', youtubeChannel: 'TED', readTime: 20, age: 88 },
    { id: 'sinek', url: 'https://www.youtube.com/@TED', title: 'How great leaders inspire action', summary: 'Simon Sinek’s golden circle: people don’t buy what you do, they buy why you do it. Start with why.', category: 'Business', tags: ['leadership', 'purpose'], concepts: ['leadership', 'purpose'], sourceType: 'youtube', sourceName: 'YouTube', youtubeChannel: 'TED', readTime: 18, age: 95 },
    { id: 'walker', url: 'https://www.youtube.com/@TED', title: 'Sleep is your superpower', summary: 'Sleep scientist Matt Walker on what a good night does for learning and memory, and his two tips: keep a regular schedule, and keep the room cool.', category: 'Health', tags: ['sleep', 'memory'], concepts: ['sleep', 'health'], sourceType: 'youtube', sourceName: 'YouTube', youtubeChannel: 'TED', readTime: 20, age: 102 },
    { id: 'egg', url: 'https://www.youtube.com/@kurzgesagt', title: 'The Egg - A Short Story', summary: 'Kurzgesagt animates Andy Weir’s short story about a man who dies, meets his maker, and finds out what he really is.', category: 'Stories', tags: ['short-story', 'animation'], concepts: ['meaning', 'stories'], sourceType: 'youtube', sourceName: 'YouTube', youtubeChannel: 'Kurzgesagt', readTime: 8, age: 76 },
    { id: 'entropy', url: 'https://www.youtube.com/@veritasium', title: 'The Most Misunderstood Concept in Physics', summary: 'Entropy, explained: Earth radiates away as much energy as it gets from the Sun, and life runs on the difference in its quality, not its amount.', category: 'Science', tags: ['physics', 'entropy'], concepts: ['physics', 'energy'], sourceType: 'youtube', sourceName: 'YouTube', youtubeChannel: 'Veritasium', readTime: 28, age: 64 },
    { id: 'grant', url: 'https://www.youtube.com/@TED', title: 'The surprising habits of original thinkers', summary: 'Adam Grant on originals: quick to start and slow to finish, full of doubt about their ideas, and full of ideas, most of them bad.', category: 'Psychology', tags: ['creativity', 'work'], concepts: ['creativity', 'procrastination'], sourceType: 'youtube', sourceName: 'YouTube', youtubeChannel: 'TED', readTime: 16, age: 120 },
    { id: 'freesolo', url: 'https://www.youtube.com/@NatGeo', title: 'Free Solo', summary: 'Alex Honnold climbs the 3,000-foot face of El Capitan with no rope. The documentary won the Oscar for Best Documentary Feature.', category: 'Film', tags: ['climbing', 'documentary'], concepts: ['film', 'courage'], sourceType: 'youtube', sourceName: 'YouTube', youtubeChannel: 'National Geographic', readTime: 3, age: 133 },
    { id: 'kindofblue', url: 'https://www.youtube.com/@MilesDavis', title: 'Kind of Blue', summary: 'Miles Davis’s 1959 album, built on modes instead of chord changes, and one of the best-selling jazz records ever made.', category: 'Music', tags: ['jazz', 'albums'], concepts: ['music'], sourceType: 'youtube', sourceName: 'YouTube', youtubeChannel: 'Miles Davis', readTime: 46, age: 84 },
    { id: 'mulafossur', url: 'https://www.instagram.com/northbound.days/', title: 'Múlafossur waterfall, Faroe Islands', summary: 'A waterfall that drops straight into the Atlantic beside the tiny village of Gásadalur, on the island of Vágar. A short walk from the road.', category: 'Travel', tags: ['faroe-islands', 'waterfalls'], concepts: ['travel', 'nature'], sourceType: 'web', sourceName: '@northbound.days', readTime: 1, age: 81 },
    { id: 'wtrek', url: 'https://www.instagram.com/farwalks/', title: 'The W Trek, Torres del Paine', summary: 'Four or five days from refuge to refuge in Chilean Patagonia: the granite towers, the French Valley and Grey Glacier. Book the refuges early.', category: 'Outdoors', tags: ['patagonia', 'hikes'], concepts: ['hiking', 'travel'], sourceType: 'web', sourceName: '@farwalks', readTime: 2, age: 110 },
    { id: 'pantheon', url: 'https://www.instagram.com/romebyfoot/', title: 'The Pantheon, Rome', summary: 'Nearly 1,900 years old and still the largest unreinforced concrete dome in the world. The oculus at the top is open to the sky.', category: 'Architecture', tags: ['rome', 'domes'], concepts: ['architecture', 'history'], sourceType: 'web', sourceName: '@romebyfoot', readTime: 1, age: 128 },
    { id: 'lisbon', url: 'https://www.instagram.com/sevenhills.walks/', title: 'Miradouro da Senhora do Monte', summary: 'One of the highest viewpoints in Lisbon, over the castle, the rooftops and the river. Go at sunset.', category: 'Travel', tags: ['lisbon', 'viewpoints'], concepts: ['travel'], sourceType: 'web', sourceName: '@sevenhills.walks', readTime: 1, age: 59 },
    { id: 'seljalandsfoss', url: 'https://www.instagram.com/ringroad.notes/', title: 'Seljalandsfoss, Iceland', summary: 'The waterfall you can walk behind, on Iceland’s south coast. Bring a rain jacket: the path behind it is soaked with spray.', category: 'Travel', tags: ['iceland', 'waterfalls'], concepts: ['travel', 'nature'], sourceType: 'web', sourceName: '@ringroad.notes', readTime: 1, age: 97 },
    { id: 'greatwork', url: 'https://paulgraham.com/greatwork.html', title: 'How to Do Great Work', summary: 'Paul Graham’s long essay on doing great work: choose something you are deeply curious about, learn enough to reach its frontier, and work hard on it.', category: 'Work', tags: ['essays', 'craft'], concepts: ['work', 'curiosity'], sourceType: 'web', sourceName: 'Paul Graham', readTime: 45, age: 70 },
    { id: 'makers', url: 'https://paulgraham.com/makersschedule.html', title: 'Maker’s Schedule, Manager’s Schedule', summary: 'Why one meeting can wreck a maker’s afternoon: makers work in units of half a day, managers in hours.', category: 'Work', tags: ['focus', 'meetings'], concepts: ['work', 'attention'], sourceType: 'web', sourceName: 'Paul Graham', readTime: 6, age: 140 },
    { id: 'sivers', url: 'https://sive.rs/hellyeah', title: 'Hell Yeah or No', summary: 'If you’re not saying “hell yeah” about something, say no. Saying no to almost everything leaves room for the few things that matter.', category: 'Decisions', tags: ['decisions', 'focus'], concepts: ['decisions', 'attention'], sourceType: 'web', sourceName: 'Derek Sivers', readTime: 2, age: 115 },
    { id: 'truefans', url: 'https://kk.org/thetechnium/1000-true-fans/', title: '1,000 True Fans', summary: 'To make a living as a creator you don’t need millions of fans, only about a thousand true fans who will buy whatever you make.', category: 'Creativity', tags: ['creators', 'audience'], concepts: ['creativity', 'work'], sourceType: 'web', sourceName: 'Kevin Kelly', readTime: 12, age: 150 },
    { id: 'hailmary', url: 'https://www.andyweirauthor.com/', title: 'Project Hail Mary', summary: 'A science teacher wakes up alone on a spaceship with no memory of how he got there, and has to work out how to save Earth.', category: 'Books', tags: ['novels', 'sci-fi'], concepts: ['fiction', 'space'], sourceType: 'web', sourceName: 'Andy Weir', readTime: 3, age: 66 },
    { id: 'kahneman', url: 'https://www.goodreads.com/', title: 'Thinking, Fast and Slow', summary: 'Daniel Kahneman on the two systems behind how we think, one fast and intuitive, one slow and deliberate, and the errors that come from trusting the first.', category: 'Books', tags: ['psychology', 'decisions'], concepts: ['psychology', 'decisions'], sourceType: 'web', sourceName: 'Goodreads', readTime: 3, age: 106 },
    { id: 'range', url: 'https://davidepstein.com/range/', title: 'Range: Why Generalists Triumph in a Specialized World', summary: 'David Epstein’s case for breadth: people who sample widely and specialize late often go further than early specialists.', category: 'Books', tags: ['careers', 'learning'], concepts: ['work', 'curiosity'], sourceType: 'web', sourceName: 'David Epstein', readTime: 4, age: 124 },
    { id: 'overstory', url: 'https://wwnorton.com/', title: 'The Overstory', summary: 'Nine strangers whose lives are changed by trees, in Richard Powers’ novel that won the 2019 Pulitzer Prize for Fiction.', category: 'Books', tags: ['novels', 'trees'], concepts: ['fiction', 'nature'], sourceType: 'web', sourceName: 'W. W. Norton', readTime: 3, age: 158 },
    { id: 'tomorrow', url: 'https://www.penguinrandomhouse.com/', title: 'Tomorrow, and Tomorrow, and Tomorrow', summary: 'Two friends who meet as kids make video games together for thirty years, through success, a falling out, and love.', category: 'Books', tags: ['novels', 'games'], concepts: ['fiction', 'friendship'], sourceType: 'web', sourceName: 'Penguin Random House', readTime: 3, age: 47 },
    { id: 'sevenmin', url: 'https://www.nytimes.com/', title: 'The Scientific 7-Minute Workout', summary: 'Twelve bodyweight exercises, 30 seconds each with 10 seconds of rest, built on high-intensity interval research.', category: 'Fitness', tags: ['workouts', 'quick'], concepts: ['exercise', 'routine'], sourceType: 'web', sourceName: 'The New York Times', readTime: 5, age: 53 },
    { id: 'c25k', url: 'https://www.nhs.uk/', title: 'Couch to 5K', summary: 'A nine-week plan that takes you from no running at all to running 5K, three runs a week.', category: 'Fitness', tags: ['running', 'plans'], concepts: ['exercise', 'habits'], sourceType: 'web', sourceName: 'NHS', readTime: 4, age: 136 },
    { id: 'boxbreath', url: '', title: 'Box breathing before big meetings', summary: 'In for four, hold for four, out for four, hold for four. Two or three rounds.', category: 'Wellness', tags: ['breathing', 'calm'], concepts: ['calm', 'routine'], sourceType: 'note', readTime: 1, age: 92 },
    { id: 'refactoringui', url: 'https://www.refactoringui.com/', title: 'Refactoring UI', summary: 'Practical design tactics for developers, like starting with too much white space and never putting grey text on a colored background.', category: 'Design', tags: ['ui', 'tactics'], concepts: ['design', 'craft'], sourceType: 'web', sourceName: 'Refactoring UI', readTime: 7, age: 145 },
    { id: 'butterick', url: 'https://practicaltypography.com/', title: 'Butterick’s Practical Typography', summary: 'A free online book on typography for everyday writers. The first rule: get the body text right, then everything else.', category: 'Design', tags: ['typography', 'writing'], concepts: ['design', 'writing'], sourceType: 'web', sourceName: 'Matthew Butterick', readTime: 10, age: 118 },
    { id: 'paleblue', url: 'https://science.nasa.gov/', title: 'Pale Blue Dot', summary: 'Voyager 1’s 1990 photo of Earth from about six billion kilometers away, a speck in a sunbeam, and Carl Sagan’s reflection on it.', category: 'Space', tags: ['voyager', 'perspective'], concepts: ['space', 'perspective'], sourceType: 'web', sourceName: 'NASA', readTime: 3, age: 112 },
    { id: 'pomodoro', url: 'https://www.pomodorotechnique.com/', title: 'The Pomodoro Technique', summary: 'Work for 25 minutes, take a 5-minute break, and after four rounds take a longer one. A kitchen timer is the whole system.', category: 'Productivity', tags: ['focus', 'timers'], concepts: ['attention', 'work'], sourceType: 'web', sourceName: 'Francesco Cirillo', readTime: 4, age: 131 },
    // the needle: a screenshot of Sam's text, as the app files it (its note
    // is the advice Sam added; Weekend plans is where it was collected)
    { id: 'atomichabits', url: 'capture://screenshot/atomic-habits.png', title: 'Read Atomic Habits, start small', summary: 'Sam’s pick: James Clear on how tiny habits, repeated every day, compound into remarkable results. Make them obvious, attractive, easy and satisfying.', category: 'Books', tags: ['habits', 'from-sam'], concepts: ['habits', 'recommendation'], sourceType: 'image', sourceName: 'Screenshot', readTime: 1, age: 142, note: 'Sam says start with the two-minute rule.', collections: ['weekend'] },
    // ((round 3) the video's account, `NEEDLE_VIDEO` below, swaps this card
    // for Sam's YouTube pick)
    // a decoy everyone knows, on frame 0 beside Project Hail Mary
    { id: 'dune', url: 'https://www.instagram.com/slowshelf/', title: 'Dune', summary: 'Frank Herbert’s desert-planet epic of politics, prophecy and the spice everyone wants. Book one of six.', category: 'Books', tags: ['sci-fi', 'classics'], concepts: ['fiction', 'space'], sourceType: 'web', sourceName: '@slowshelf', readTime: 2, age: 61 },
    { id: 'spirited', url: 'https://www.ghibli.jp/', title: 'Spirited Away', summary: 'Hayao Miyazaki’s story of a girl who works in a bathhouse for spirits to save her parents. It won the Oscar for Best Animated Feature.', category: 'Film', tags: ['animation', 'ghibli'], concepts: ['film', 'stories'], sourceType: 'web', sourceName: 'Studio Ghibli', readTime: 2, age: 141 },
  ],
};

/**
 * (round 3, owner: a YouTube version, a Mark Manson video) FIND THE BOOK's
 * other needle: the same account, with Sam's pick a YouTube save instead of
 * the screenshot. The video is real, on Mark Manson's own channel: title,
 * channel and length checked against YouTube, and the card's summary, length
 * and key moments are Machina's own analysis of it (the call a Pro save
 * makes: capture/video-facts/Nxy6SIM11sA.json; its title kept as YouTube
 * has it). Sam's note names the tip; the answer finds its minute.
 */
const CHEATCODES = {
  id: 'cheatcodes',
  url: 'https://www.youtube.com/watch?v=Nxy6SIM11sA',
  title: 'Life is a Video Game, Here Are the Cheat Codes',
  summary: 'Mark Manson on life as an infinite game: failures build character, so pick a main quest and say no to the side quests.',
  category: 'Productivity',
  tags: ['goal-setting', 'from-sam'],
  concepts: ['purpose', 'recommendation'],
  sourceType: 'youtube',
  sourceName: 'YouTube',
  youtubeChannel: 'Mark Manson',
  // 12:39, as the analysis rounds it (videoDurationMinutes)
  readTime: 13,
  age: 142,
  note: 'Sam says the first cheat code is the one.',
  collections: ['weekend'],
  // the analysis' key moments (the Ask context reads them: functions/ai_service.py)
  highlights: ['0:54 - Defines life as an infinite game', '1:57 - Explains that character is built through failures', '3:16 - Introduces the first cheat code: skip the side quests', '8:00 - Discusses the importance of boundaries', '11:28 - Explains the charity cheat code'],
};

export const NEEDLE_VIDEO = {
  ...NEEDLE,
  needle: 'cheatcodes',
  ask: {
    question: 'What was the video Sam told me to watch?',
    // every claim is on the card: its title and channel, its note, its key
    // moment (the minute, bold as the model sets what matters; the reel
    // pings it: `minute`)
    answer: 'It’s Mark Manson’s “Life is a Video Game, Here Are the Cheat Codes”. Sam’s note says the first cheat code is the one: skip the side quests, at **3:16**.',
    sources: ['cheatcodes'],
    minute: '3:16',
  },
  extra: [...NEEDLE.extra.filter((c) => c.id !== 'atomichabits'), CHEATCODES],
};

/**
 * REVISIT (clips/revisit-timeline.mjs): the reel about what comes back. The
 * same account FIND THE BOOK used (the 24 saves without the recipes, plus
 * the 32 extra real saves), minus Sam's screenshot, plus one real YouTube
 * save: Mark Manson's "How to Beat Procrastination Like It Owes You Money"
 * (his own channel, 11:45). Its title and channel are YouTube's own
 * (oEmbed), its length the channel's upload list, and everything the app
 * says about it (summary, key moments, its "Do this") is Machina's own
 * analysis of the video, the call a Pro save makes
 * (capture/video-facts/-Feev1ZK6L4.json), checked against a second model's
 * transcript of its first 45 seconds and its last two minutes.
 *
 * The Revisit tab then holds what this week left: a reminder that is due,
 * the open "Do this" lines (each written for a save that calls for an
 * action, as the analysis does; the video's is the analysis' own, word for
 * word) and this week's synthesis, written from the six saves of the week.
 */
const DOSOMETHING = {
  id: 'dosomething',
  url: 'https://www.youtube.com/watch?v=-Feev1ZK6L4',
  title: 'How to Beat Procrastination Like It Owes You Money',
  // the analysis' summary, as the app stores it
  summary: 'Inaction is primarily an emotional problem rather than a lack of knowledge or discipline.\n\nBy setting up an environment that makes desired actions inevitable and using small, concrete steps, you can overcome procrastination and build momentum.',
  category: 'Productivity',
  tags: ['procrastination', 'behavior-change', 'motivation'],
  concepts: ['Do Something Principle', 'Environment Design', 'Incentive Structure'],
  sourceType: 'youtube',
  sourceName: 'YouTube',
  youtubeChannel: 'Mark Manson',
  // 11:45, as the analysis rounds it (videoDurationMinutes)
  readTime: 12,
  // saved this morning: the newest save, so the top of "Do this"
  age: 0.15,
  highlights: ['0:00 - Explains that inaction is an emotional problem', '1:09 - Introduces the 4 steps to taking action', '2:14 - Discusses creating incentives for behavior change', '8:12 - Explains leveraging social pressure', '10:31 - Highlights the importance of recognizing failure as progress'],
  // the analysis' actionableTakeaway, verbatim
  takeaway: 'When you feel stuck, identify the smallest, simplest action you can take today to move toward your goal and do it immediately to trigger the do something principle.',
};

export const REVISIT = {
  /** no cooking (owner, 2026-10-02); no Sam (FIND THE BOOK's device); and
   *  the one video on procrastination is Manson's (Tim Urban's TED talk
   *  would make the reel's "a video on procrastination" two) */
  without: ['marcella', 'chicken', 'piranesi', 'systems', 'procrastinator'],
  withoutCollections: ['cook'],
  /** this week is six saves: the video, The Tail End, the V60, Four
   *  Thousand Weeks, Cala Goloritzé and Perfect Days */
  ages: { tailend: 1, coffee: 2, fourthousand: 4, goloritze: 5, perfectdays: 6 },
  extra: [...NEEDLE.extra.filter((c) => c.id !== 'atomichabits'), DOSOMETHING],
  /** the video the reel follows */
  video: 'dosomething',
  /**
   * The open "Do this" lines, newest save first (the order Revisit lists
   * them). Only saves that call for an action carry one, as in the app; each
   * is true to its save's own summary. The video's is Machina's analysis.
   */
  takeaways: {
    dosomething: DOSOMETHING.takeaway,
    tailend: 'Call your parents this week, and put the next visit on the calendar.',
    coffee: 'Tomorrow morning, try the two-stage pour with a 45-second bloom.',
    fourthousand: 'Choose what you will leave undone this week, on purpose.',
    goloritze: 'Start the trail down from the Golgo plateau early: it takes about an hour.',
  },
  /** a reminder the user set, due now (Revisit's first section) */
  reminders: ['yoga'],
  /**
   * This week's synthesis ("This week in Machina"), written from the week's
   * six saves. Every claim is in a card's summary or the video's analysis
   * (the "do something principle": action is the cause of motivation, not
   * its result; inaction is a feeling, not a lack of knowing what to do).
   */
  synthesis: {
    title: 'A week about finally starting',
    narrative: [
      'Six saves this week, and the loudest one is a video on procrastination. Mark Manson’s point: putting things off is a feeling, not a lack of know-how, and the way out is the smallest step you can take today.',
      'Four Thousand Weeks says you will never get to everything, so choose. The Tail End puts a number on why it matters: the visits you have left with your parents. And a quiet film, a slow coffee and a hidden beach make the case for doing fewer things, properly.',
    ].join('\n'),
    themes: [
      {
        title: 'Start before you feel ready',
        insight: 'Manson says action comes before motivation, not after it. Burkeman and The Tail End add the reason not to wait: the time is shorter than it feels.',
        cardIds: ['dosomething', 'fourthousand', 'tailend'],
      },
      {
        title: 'Fewer things, done properly',
        insight: 'A film about one quiet routine, a coffee worth slowing down for, and a beach you can only reach on foot or by boat.',
        cardIds: ['perfectdays', 'coffee', 'goloritze'],
      },
    ],
    standoutCardId: 'dosomething',
    standoutReason: 'The one to act on. Its whole case fits in a line: don’t wait to feel like it; do the smallest thing, and the feeling follows.',
    openQuestion: 'What is the smallest step you could take today on the thing you keep putting off?',
    cardCount: 6,
  },
};

/**
 * SAME SCREENSHOTS (2026-11-01, clips/shots-timeline.mjs): the three
 * screenshots, saved by sharing each one to Machina (one share, one card:
 * several screenshots shared at once make ONE card, G3). Their images are the
 * reel's own renders (public/clips/shots/<id>.png, `MachinaShotsStill`),
 * served by the capture server at /shots/, so the card banners are the same
 * pixels the reel's camera roll shows. What the backend would write, written
 * as the app files a screenshot (sourceType image, its url the image). Real
 * facts only. No cooking content (owner, 2026-10-02). The search shares no
 * word with the card it finds: nothing here says "quote" or "overthinking".
 */
export const SHOTS = {
  /** no cooking content; Piranesi is a screenshot card with no image (its url
   *  is not http), which would sit right under the three as a blank one */
  without: ['marcella', 'chicken', 'piranesi', 'tailend'],
  withoutCollections: ['cook'],
  /** shared in this order, so the feed shows them newest first */
  cards: [
    {
      id: 'shot-camera',
      image: 'camera',
      title: 'Olympus mju II film camera, €189',
      summary: 'A used Olympus mju II, the 1997 pocket 35mm with a sharp f/2.8 lens and a splash-proof body. Listed in excellent condition and tested with film.',
      category: 'Shopping',
      tags: ['film-photography', 'cameras'],
      concepts: ['photography', 'shopping'],
      minutes: 9,
    },
    {
      id: 'shot-seneca',
      image: 'seneca',
      title: 'Seneca: we suffer more in imagination',
      summary: 'From Seneca’s Letters to Lucilius: we suffer more often in imagination than in reality. Most of what we dread never actually happens.',
      category: 'Philosophy',
      tags: ['stoicism', 'seneca', 'worry'],
      concepts: ['stoicism', 'anxiety'],
      minutes: 6,
    },
    {
      id: 'shot-viewpoint',
      image: 'viewpoint',
      title: 'Miradouro da Senhora do Monte, Lisbon',
      summary: 'Lisbon’s highest viewpoint, up in Graça, with the castle, the old town and the river below. Best at sunset; tram 28 stops a short walk away.',
      category: 'Travel',
      tags: ['lisbon', 'viewpoints'],
      concepts: ['travel', 'cities'],
      minutes: 3,
    },
  ],
  /** the search that finds one again, in your own words */
  search: { query: 'quote about overthinking', hits: ['shot-seneca'] },
};

/** The card the Save beat captures (it is also the first Ask source). */
export const SAVE = {
  id: 'tailend',
  url: 'waitbutwhy.com/2015/12/the-tail-end.html',
};

export { DAY };
