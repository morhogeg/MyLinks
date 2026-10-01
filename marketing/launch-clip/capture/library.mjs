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

/** The card the Save beat captures (it is also the first Ask source). */
export const SAVE = {
  id: 'tailend',
  url: 'waitbutwhy.com/2015/12/the-tail-end.html',
};

export { DAY };
