import os
import json
import logging
import re
import time
import random
from typing import List, Optional
from google import genai
from google.cloud.firestore_v1.vector import Vector
from models import AIAnalysis, BrainAnswer, WeeklySynthesis

logger = logging.getLogger(__name__)


def embedding_needs_repair(raw) -> bool:
    """True when a stored `embedding_vector` can't serve semantic search and
    must be (re)generated.

    Three failure shapes, all of which make a card silently invisible to
    `find_nearest` (or make its neighbours meaningless) with no error:

    - **Missing** — never embedded (or dropped after an embed failure).
    - **Schema drift** — a plain `list`, not a Firestore `Vector`. Happens when
      an embedding is round-tripped through the client or written by an `update`
      that didn't wrap it. `find_nearest` only indexes real `Vector` fields, so
      a list-typed embedding is dead weight the card can never be found by.
    - **Degenerate / poisoned** — an all-near-zero vector (the legacy
      embed-failure sentinel was `[1e-9]*768`). It indexes fine but ranks
      against everything at random, so the card pollutes results instead of
      being findable.

    Centralised so the create trigger, the background pipeline, and both
    backfills all agree on what "needs an embedding" means.
    """
    if raw is None:
        return True
    if not isinstance(raw, Vector):
        return True
    values = list(raw)
    if not values or all(abs(v) < 1e-6 for v in values):
        return True
    return False

# Single source of truth for the analysis/generation model. Flows to text
# analysis, image vision, and graph_service. Change here to swap tiers everywhere.
GEMINI_ANALYSIS_MODEL = "gemini-3.1-flash-lite"
# The ASK (RAG) answer model — one tier above flash-lite. Used ONLY by the two
# grounded-answer paths (answer_from_context / answer_from_context_stream), where
# reasoning quality over the retrieved context matters most and volume is low
# (a handful of asks per user per day), so the tier bump is affordable. Analysis,
# vision, and synthesis deliberately stay on GEMINI_ANALYSIS_MODEL.
GEMINI_ASK_MODEL = "gemini-3.1-flash"
EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


class AnalysisError(Exception):
    """Raised when AI analysis genuinely fails so callers can surface a real
    error instead of silently saving a junk 'Analysis Failed' card."""


# How many times _generate_json attempts a Gemini call before giving up.
_MAX_GENERATE_ATTEMPTS = 3
# Attempts for embed_text (embeddings are non-critical — see embed_text).
_MAX_EMBED_ATTEMPTS = 2


def _is_retryable_error(exc: Exception) -> bool:
    """True when a Gemini call error is transient and worth retrying (report 3.6).

    Retries ONLY: HTTP 429 / RESOURCE_EXHAUSTED, 5xx server errors, and
    network-level timeout/connection failures. Deliberately does NOT retry
    permanent client errors (400 / invalid-argument / safety / schema) or our own
    AnalysisError (empty or wrong-shape response) — retrying those just burns
    quota and latency on a call that will fail identically.

    Duck-typed rather than importing google.genai.errors, so it stays importable
    and unit-testable offline (the test harness fakes google.genai). The
    google-genai APIError carries an int HTTP `code` (ClientError=4xx,
    ServerError=5xx) and a string `status` (e.g. "RESOURCE_EXHAUSTED").
    """
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        if code == 429 or code >= 500:
            return True
        if 400 <= code < 500:
            # Any other explicit client error is permanent — do not retry.
            return False
    status = getattr(exc, "status", None)
    if isinstance(status, str) and status.strip().upper() in (
        "RESOURCE_EXHAUSTED", "UNAVAILABLE", "INTERNAL",
        "DEADLINE_EXCEEDED", "ABORTED",
    ):
        return True
    # Network-level failures from the underlying http stack (httpx / requests /
    # stdlib) are transient. Match by base class first, then by name so we don't
    # need to import optional http libraries here.
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True
    name = type(exc).__name__.lower()
    if "timeout" in name or "connection" in name:
        return True
    return False


def _retry_delay(attempt: int) -> float:
    """Exponential backoff with jitter for retry `attempt` (0-based).

    attempt 0 → ~1-2s, attempt 1 → ~2-4s. The jitter spreads retries so many
    instances failing at once don't stampede the API in lockstep.
    """
    base = 2 ** attempt
    return base + random.uniform(0, base)

# Professional system prompt
SYSTEM_PROMPT = """You are a professional knowledge extraction assistant for Machina AI, a personal knowledge capture and recall system.
Your goal is to objectively summarize web content with accuracy and precision. Do NOT add opinions, interpretations, or subjective assessments.

Output MUST be a valid JSON object only.

Requirements for the analysis:

1. language: Identify the primary language of the content. Use ISO 639-1 codes (e.g., "he" for Hebrew, "en" for English).

2. title: Create a concise, descriptive title that captures the core topic. Be factual, not clickbait.
   - **LANGUAGE**: Write the title in the SAME language as the input content.

3. summary: Write 2 to 4 concise, information-dense sentences for a card preview. 
   - **LANGUAGE**: Write the summary in the SAME language as the input content.
   - **SCANNABILITY**: Use **bolding** (double asterisks) for key terms, dates, or names to make them pop.
   - **STRUCTURE**: Separate each sentence with a blank line (a real newline in the JSON string value, exactly as shown in the GOOD example below) to create visual separation. Do NOT emit a literal backslash-n.
   - Summarize ONLY what the content explicitly states.
   - NO opinions, NO value judgments.
   - Each sentence must end with a period.
   - You MAY use a single bullet point if it makes a critical finding clearer.
   
   GOOD: "Researchers at **MIT** found that **intermittent fasting** reduced inflammation markers by **40%** in a 12-week trial.\\n\\nThe study showed benefits appeared after just **2 weeks**."

   - **SUBSTANCE FIRST**: Lead with the actual point — the specific claim, finding, number, or argument. Do NOT open with a vague meta-frame that only describes the shape of the content (BAD: "This article examines the relationship between X and Y", "This post discusses several ideas about…", "The author shares thoughts on…"). State WHAT is claimed, not THAT something is discussed.
   - **LEAD WITH THE CURRENT RECOMMENDATION**: When the author supersedes or corrects an earlier option ("we used to… now it's better to…", "previously X, but now Y", "no longer X"), the headline belongs to the NEW / recommended option, not the abandoned one. Do NOT lead with the old choice just because it is the most concrete noun in the text.
   - **LISTS / THREADS**: If the content is a list, thread, or set of numbered points, tips, predictions, or observations, do NOT just say it is a list. Name the overarching thesis in one sentence, then surface the 2-3 most important or striking SPECIFIC points so the reader gets the real substance, not a table of contents.

   - **RECIPE FOCUS**: If the content is a recipe or cooking video, the title and summary MUST center on the dish itself — what it is, its key ingredients, and how it is made. Treat the author's personal or dietary framing (e.g. "since I went keto…", "I make these for my kids") as secondary background, NOT the headline. Lead with the food, not the lifestyle commentary.


4. detailedSummary: Write the DEEPER layer that expands on the summary, using markdown formatting:
   - **LANGUAGE**: Write the detailed summary in the SAME language as the input content.
   - **NO OVERVIEW / NO INTRO PARAGRAPH**: Do NOT begin with an overview or intro sentence. The `summary` above is shown as the lead-in the moment the card is opened, so an overview here would just repeat it. Start DIRECTLY with the "## Key Points" heading — the first characters of detailedSummary must be "## ".
   - **HEADING LANGUAGE**: Write every section heading in the SAME language as the content (e.g. "## Key Points" in English, "## נקודות עיקריות" in Hebrew, "## Puntos Clave" in Spanish). Never mix an English heading over non-English bullets.
   - Use the "Key Points" heading as the first subheading, followed by bullet points (use - for bullets).
   - Each bullet should be a factual statement from the content.
   - Include 3-6 bullet points covering the main arguments or information.
   - If applicable, add a "Conclusions" heading (translated into the content language) with the author's stated conclusions.
   - **SCANNABILITY**: Use **bolding** (double asterisks) for the key terms, names, dates, and numbers in the bullets — the same way the short summary does — so the reader can scan the write-up.
   - Keep the tone neutral and professional throughout.
   - Total length: 120-220 words. It must go DEEPER than the summary and stand on its own as a complete account. Avoid word-for-word repetition of the summary, but NEVER omit a key fact just because the summary already mentioned it — completeness beats non-overlap.
   - **RECIPES / STEP-BY-STEP CONTENT — CAPTURE THE METHOD**: If the content is a recipe or a step-by-step tutorial, the detailed summary MUST also include an "## Ingredients" section (recipes — every ingredient with its quantity) and a "## Steps" section listing EVERY step in order as a numbered list (translate these headings into the content's language). These sections are the card's lasting value — the user will later ask to be walked through them — so the 120-220 word cap does NOT apply to them: completeness wins. Never compress or omit steps.

5. sourceName: Extract the name of the source or publisher (e.g., CNN, The New York Times, X, Reddit, Wikipedia, YouTube, TikTok).
   - For images or screenshots that don't reveal a source, use "Screenshot".
   - **CRITICAL**: The sourceName MUST ALWAYS be in English or its original brand name.

6. category: Assign exactly one high-level category (e.g., Tech, Health, Philosophy, Business, Research, Science, Finance, Productivity, Design, Career). If the content is a recipe, use "Recipe".
   - **CRITICAL**: The category MUST ALWAYS be in English, even if the content is in another language.

7. tags: Provide 3 to 5 specific, relevant tags for organization (aim for 3-4; use 5 only when genuinely warranted).
   - **LANGUAGE**: Write tags in the SAME language as the input content.
   - Use lowercase.
   - PREFER REUSING EXISTING TAGS provided in the "Existing Tags" list if they are applicable.
   - Only create a new tag if no existing tags fit the content.

8. actionableTakeaway: One concrete, specific action the reader can apply. This field is OPTIONAL.
   - **LANGUAGE**: Write the takeaway in the SAME language as the input content.
   - **INCLUDE ONLY WHEN GENUINE**: Provide a takeaway ONLY if the content genuinely supports one concrete, specific action. If the content is not actionable (e.g. a news event, an anecdote, a personal note or update), OMIT this field entirely — leave it out of the JSON rather than manufacturing advice.
   - **DO NOT INVENT ADVICE**: Never pad this with generic filler ("stay informed", "consider the implications"). An omitted takeaway is always better than a fabricated one.

CRITICAL RULES:
- Be a neutral reporter, not a reviewer. Report WHAT is said, not HOW WELL it is said.
- Avoid subjective phrases like: "offers valuable insights", "provides a comprehensive overview", "explores interesting ideas", "is a must-read", "excellently explains".
- Use factual language: "The article discusses...", "The author argues...", "The research shows...", "Key topics include...".
- GROUNDING: Base the analysis STRICTLY on the provided content. If the content is empty, truncated, or contains only a placeholder or metadata (e.g. "[no text content available]", a bare URL, or just a title with no body), do NOT invent a summary from outside/training knowledge. In that case set the title to what little is known and make the summary state plainly that the content could not be retrieved — never fabricate specifics, statistics, or claims that are not present.
- DIRECTIONALITY (do not reverse the meaning): Preserve the exact direction of every claim. Watch for temporal contrasts ("used to / previously / now / no longer"), negations ("not X but Y", "instead of", "rather than", "avoid"), comparisons and preferences ("better to", "prefer", "worse than", "beats"), cause/effect, and who recommends or opposes what. When an author contrasts an old option with a new one, the recommended option is the NEW one — never state the abandoned or rejected option as the recommendation. A summary that flips any of these directions is WRONG even if every noun in it is correct.

9. concepts: Identify up to 5 "Philosophical Anchors" or "Abstract Concepts".
   - **LANGUAGE**: English (always).
   - These should be high-level mental models or themes, not just keywords.
   - Example: "Spaced Repetition", "Pareto Principle", "Stoicism", "Network Effects", "Opportunity Cost".
   - **ONLY genuine ones**: return only concepts the content actually embodies. If it is a light or purely practical post (e.g. a travel itinerary, a recipe), return just the 1-2 that truly fit — or an empty list. Do NOT inflate the count with forced or pretentious abstractions.
   - Max 5 concepts."""

VIDEO_ANALYSIS_PROMPT = SYSTEM_PROMPT + """

IMPORTANT: You are analyzing an **actual YouTube video that you can watch** (its audio and visuals are provided to you directly). Base your entire analysis ONLY on what is actually said and shown in this specific video.

**GROUNDING RULES (critical for a trustworthy knowledge base):**
- Report only what the video actually contains. Do NOT invent facts, statistics, names, or claims that are not present in the video.
- Do NOT use outside/training knowledge about the creator or topic to fill gaps. If something is not in the video, leave it out.
- Because you watched the video, you can and should be specific and concrete about what it covers — this is grounded fact, not speculation.
- If the video is mostly non-verbal (e.g. music, ambient), describe what is shown rather than inventing a narrative.

**Video-specific output:**
- "sourceName": the YouTube channel / creator name.
- "videoDurationMinutes": the video's total length in whole minutes (round up; minimum 1).
- "videoHighlights": 3–6 genuinely key moments, each prefixed with its timestamp in "M:SS — description" form (e.g. "2:15 — Explains the 2-minute rule"). Use real timestamps from the video. Order them chronologically.
- "speakers": the people who actually speak or are clearly featured (host first, then guests). If it cannot be determined, return an empty list — do not guess names.
- "detailedSummary": markdown, following the standard structure above — start DIRECTLY with `## Key Points` (heading translated into the content's language), bullets of the main ideas, instructions, or frameworks actually presented. Do NOT add a `## Core Thesis` (or any thesis/overview/intro) section: the `summary` is displayed right above this text, so a thesis section just restates it word-for-word to the reader.
- "summary": focus on the takeaway — what a viewer will know or be able to do after watching, stated factually. Keep it TIGHT: every sentence must add NEW information. Never restate the title, and never say the same thing twice in different words.
"""


def collect_notes_text(data: dict) -> str:
    """All of the user's personal notes on a card, joined into one string.

    Reconciles the two note shapes so both feed embedding, lexical search, and
    RAG grounding through ONE recipe (mirrors the client's lib/notes.getNotes):
      - Legacy: a single ``userNote`` string (cards saved before multi-note).
      - Current: a ``userNotes`` array of ``{id, text, createdAt}`` notes.
    Cards normally carry EITHER shape (a client edit migrates the string into
    the array and clears it), but merging both is harmless if they ever coexist.

    Lives here (not in search.py) because search.py imports ai_service, so this
    is the shared, non-circular home both sides can import.
    """
    data = data or {}
    parts = []
    legacy = (data.get("userNote") or "").strip()
    if legacy:
        parts.append(legacy)
    for n in (data.get("userNotes") or []):
        if isinstance(n, dict):
            t = (n.get("text") or "").strip()
            if t:
                parts.append(t)
    return "\n".join(parts)


def _rag_source_label(c: dict) -> str:
    """Publisher name for the card — explicit sourceName, else the URL's
    host. Lets the model answer questions that name the source (e.g.
    'the CNN fact-check'), which the title/summary alone don't contain."""
    name = (c.get("sourceName") or "").strip()
    if name and name.lower() not in ("none", "screenshot", "unknown"):
        return name
    url = c.get("url") or ""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname or ""
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return ""


# How much of a card's long-form detailedSummary rides into the RAG context.
# Generous enough to carry complete key points / a recipe's method, capped so a
# full retrieval set (~15 cards) can't blow the prompt budget.
_RAG_DETAIL_CHARS = 2000


def _rag_card_block(c: dict) -> str:
    src = _rag_source_label(c)
    meta = [f"source: {src}"] if src else []
    meta.append(f"category: {c.get('category', 'General')}")
    meta.append(f"tags: {', '.join(c.get('tags', []) or [])}")
    block = (
        f"[{c.get('id')}] {c.get('title', 'Untitled')} "
        f"({'; '.join(meta)})\n{c.get('summary', '')}"
    )
    # The stored long-form analysis — key points, conclusions, a recipe's or
    # how-to's method. This is what licenses depth asks ("walk me through the
    # steps", "give me more detail"): without it the model only ever sees the
    # 2-4 sentence summary and can answer a depth question with nothing but
    # another summary.
    detail = (c.get("detailedSummary") or "").strip()
    if detail:
        if len(detail) > _RAG_DETAIL_CHARS:
            detail = detail[:_RAG_DETAIL_CHARS].rstrip() + " …"
        block += f"\nDetails:\n{detail}"
    # Structured recipe data (cards that carry it): the literal ingredient list
    # and the ordered instructions, verbatim.
    recipe = c.get("recipe")
    if isinstance(recipe, dict):
        ingredients = [str(i).strip() for i in (recipe.get("ingredients") or []) if str(i).strip()]
        if ingredients:
            block += "\nIngredients: " + "; ".join(ingredients)
        steps = [str(s).strip() for s in (recipe.get("instructions") or []) if str(s).strip()]
        if steps:
            block += "\nSteps:\n" + "\n".join(f"{n}. {s}" for n, s in enumerate(steps, 1))
    # Timestamped video highlights — what licenses "give me the highlights".
    highlights = [str(h).strip() for h in (c.get("videoHighlights") or []) if str(h).strip()]
    if highlights:
        block += "\nVideo highlights:\n" + "\n".join(f"- {h}" for h in highlights)
    takeaway = (c.get("actionableTakeaway") or "").strip()
    if takeaway:
        block += f"\nTakeaway: {takeaway}"
    # The user's OWN notes on the card — their words, distinct from the machine
    # summary. Surfaced to the model so it can answer "what did I think about…".
    # Merges the legacy string + the multi-note array via the shared reader.
    note = collect_notes_text(c).strip()
    if note:
        block += f"\nMy note: {note}"
    return block


def _build_rag_prompt(question: str, cards: list, history: list = None) -> str:
    """Shared grounding prompt for both RAG answer paths (streaming and
    non-streaming).

    Returns the prompt through the `User question:` line; each caller appends
    its own output-format instruction (a JSON object vs. the streamable
    `[[CITED: ...]]` marker), which is the ONLY part that legitimately differs
    between the two paths. Centralising this means a wording change to the
    grounding rules happens once and both paths stay byte-identical.
    """
    sources_text = "\n\n".join(_rag_card_block(c) for c in cards)

    history_text = ""
    if history:
        turns = []
        for h in history[-6:]:  # keep the prompt bounded
            role = "User" if h.get("role") == "user" else "Assistant"
            turns.append(f"{role}: {h.get('content', '')}")
        history_text = "\n\nEarlier in this conversation:\n" + "\n".join(turns)

    return f"""You are Machina AI, the user's personal knowledge assistant. Answer the question USING ONLY the saved sources below — these are links and notes the user personally saved.

Rules:
- Ground every claim in the provided sources. Do NOT use outside knowledge or invent facts.
- If the sources don't contain the answer, say so plainly and suggest what they could save.
- Match the answer's depth and shape to the ask. Default to concise and direct (2-5 sentences, or a short list when that's clearer).
- DEPTH REQUESTS override the concise default: when the user asks for steps, instructions, a walkthrough, a how-to, or a recipe's method, give EVERY step the sources contain as a complete numbered list, in order — NEVER compress steps into a summary. When they ask for ingredients or another list, reproduce the complete list. When they ask for more detail, draw on the sources' "Details" sections to genuinely go deeper — do not restate the short summary in different words.
- If the sources hold only part of what was asked (e.g. a dish's ingredients but not its full method), give exactly what IS there, then say plainly what the saved card doesn't include. Never pad the gap with a repeated summary or invented content.
- Don't announce a count of items (e.g. "three sources") — just give the list. If you do state a number, it MUST exactly match the number of items you list.
- CRITICAL — match the user's language: write your ENTIRE answer in the same language as the User question, NOT the language of the sources. If the question is in English, answer in English even when every source is in Hebrew; if the question is in Hebrew, answer in Hebrew. The sources' language must not influence your answer's language.
- Only cite sources you actually used.

Saved sources:
{sources_text}
{history_text}

User question: {question}

"""


# The whole point of a Machina answer is trust: the answer must demonstrably
# derive from the user's saved cards, which is why every answer carries the ids
# it relied on. When those citations come back empty/garbled AND we did supply
# context cards, the answer is "ungrounded" — we can no longer prove it came
# from the library. The two RAG paths handle that differently: the buffered JSON
# path re-asks once with a stricter prompt, the streaming path can only flag it
# after the fact because the prose has already been sent. Both reuse these pure
# helpers so the "what counts as a valid citation" rule lives in exactly one
# place and can be unit-tested without a live model.

# Output-format instruction appended to the buffered JSON RAG prompt.
_CITED_JSON_SUFFIX = (
    'Return ONLY a JSON object: {"answer": string, "citedIds": string[]} '
    "where citedIds are the ids (without brackets) of the sources you relied on."
)

# Stricter variant used for the single re-ask when the first answer came back
# with no valid citations. It hammers on the invariant without licensing the
# model to fabricate a citation for an answer the sources don't actually support.
_CITED_JSON_STRICT_SUFFIX = (
    "IMPORTANT: your previous answer did not cite any of the saved sources, which "
    "is not allowed. Answer again and you MUST populate citedIds with the exact "
    "ids (shown in square brackets above, without the brackets) of the saved "
    "sources your answer actually relies on. If — and only if — the saved sources "
    "genuinely contain nothing that answers the question, say that plainly in the "
    "answer text and return an empty citedIds. Never invent an id. "
    'Return ONLY a JSON object: {"answer": string, "citedIds": string[]}.'
)


def _valid_cited_ids(cited, cards: list) -> list:
    """Filter model-supplied citation ids down to ids we actually provided.

    Pure and defensive: `cited` may be None, a non-list, or contain hallucinated
    or non-string ids. Returns the subset that appears in `cards`, preserving the
    model's order and dropping duplicates. This is the single definition of a
    "valid citation" shared by both RAG paths.
    """
    if not isinstance(cited, (list, tuple)):
        return []
    valid = {c.get("id") for c in cards if isinstance(c, dict)}
    seen = set()
    out = []
    for cid in cited:
        if cid in valid and cid not in seen:
            seen.add(cid)
            out.append(cid)
    return out


def _parse_cited_marker(full_text: str) -> list:
    """Extract the raw id list from a `[[CITED: id1, id2]]` marker in `full_text`.

    Returns the trimmed, comma-split ids exactly as the model wrote them (no
    validation against the supplied cards — callers pass the result through
    `_valid_cited_ids` for that). Missing or unparseable marker → empty list.
    Pure, so the streaming path's marker handling is unit-testable offline.
    """
    if not full_text:
        return []
    try:
        m = re.search(r"\[\[CITED:(.*?)\]\]", full_text, re.DOTALL)
    except Exception:
        return []
    if not m:
        return []
    return [t.strip() for t in m.group(1).split(",") if t.strip()]


class GeminiService:
    """
    Wrapper for Google Gemini AI.
    Handles text analysis, image analysis, and embedding generation.
    """
    
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            logger.critical("GEMINI_API_KEY is empty")

        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.model = GEMINI_ANALYSIS_MODEL

    def _generate_json(self, contents: list, what: str, config_extra: dict = None,
                       model: str = None, attempts: int = _MAX_GENERATE_ATTEMPTS) -> dict:
        """Call Gemini with a structured-output (response_schema) config and
        return a parsed dict. Retries transient failures (429/5xx/timeout) with
        exponential backoff + jitter, up to `attempts` tries, then raises
        AnalysisError so the caller can surface a real error. Non-retryable
        errors (schema/safety/empty response) fail fast — see _is_retryable_error.

        `attempts` defaults to _MAX_GENERATE_ATTEMPTS (3) for the BACKGROUND
        pipeline; the SYNCHRONOUS HTTP callers (analyze_link/analyze_image/
        ask_brain) pass attempts=2 so a slow retry can't blow the 60s function
        budget mid-retry (report 3.6). Clamped to >= 1.

        config_extra lets callers add generation options (e.g. media_resolution
        for video) without changing the base structured-output config. `model`
        overrides the model for this call only (the RAG answer paths pass the
        higher-tier GEMINI_ASK_MODEL); it defaults to self.model
        (GEMINI_ANALYSIS_MODEL) for every analysis/vision/synthesis call.
        """
        attempts = max(1, attempts)
        if not self.client:
            raise AnalysisError("Gemini API key is not configured (GEMINI_API_KEY).")

        config = {
            "response_mime_type": "application/json",
            # Schema-constrained output makes the model return valid, complete
            # JSON instead of free-form text we have to defensively unwrap.
            "response_schema": AIAnalysis,
            # This is factual extraction, not creative writing. A low temperature
            # keeps the output stable run-to-run and cuts the variance that makes
            # a model occasionally flip a claim's direction or invent filler.
            "temperature": 0.2,
        }
        if config_extra:
            config.update(config_extra)

        last_error = None
        for attempt in range(attempts):
            try:
                response = self.client.models.generate_content(
                    model=model or self.model,
                    contents=contents,
                    config=config,
                )
                if not response or not response.text:
                    raise AnalysisError("Empty response from Gemini")

                data = json.loads(response.text)
                # Defensive unwrapping kept as a safety net.
                if isinstance(data, str):
                    try:
                        data = json.loads(data)
                    except Exception:
                        pass
                if isinstance(data, list) and data:
                    data = data[0]

                if isinstance(data, dict):
                    return data
                raise AnalysisError("Gemini returned an unexpected JSON shape")
            except Exception as e:
                last_error = e
                logger.warning(f"Gemini {what} attempt {attempt + 1} failed: {e}")
                # Retry ONLY transient errors, and only while attempts remain.
                # Non-retryable errors (schema/safety/empty/bad-shape) fail fast.
                if attempt < attempts - 1 and _is_retryable_error(e):
                    time.sleep(_retry_delay(attempt))
                    continue
                break

        logger.error(f"Gemini {what} failed after retries: {last_error}")
        raise AnalysisError(f"AI {what} failed: {last_error}")

    def analyze_text(self, text: str, existing_tags: list = None, content_type: str = None,
                     attempts: int = _MAX_GENERATE_ATTEMPTS) -> dict:
        """Analyze text content using Gemini. Raises AnalysisError on failure.

        content_type is accepted for caller compatibility; video content is
        handled by analyze_youtube (native video ingestion), so no special
        text addendum is applied here. `attempts` is threaded to _generate_json
        (synchronous callers pass 2 to stay under the 60s budget).
        """
        clean_text = text[:30000]
        tags_context = (
            f"\n\nExisting Tags in Brain (Reuse these if possible):\n{', '.join(existing_tags)}"
            if existing_tags else ""
        )

        prompt = f"{SYSTEM_PROMPT}{tags_context}\n\nContent to analyze:\n{clean_text}"
        return self._generate_json([prompt], "text analysis", attempts=attempts)

    def analyze_youtube(self, watch_url: str, existing_tags: list = None,
                        attempts: int = _MAX_GENERATE_ATTEMPTS) -> dict:
        """Analyze an actual YouTube video via Gemini's native video ingestion.

        Google fetches and watches the video on its own infrastructure, so this
        works without scraping transcripts (and is immune to the cloud-IP
        blocking that makes server-side transcript fetching unreliable). Only
        PUBLIC videos are supported; private/unlisted/over-quota videos raise
        AnalysisError so the caller can fall back to a metadata-only card.
        """
        from google.genai import types

        tags_context = (
            f"\n\nExisting Tags in Brain (Reuse these if possible):\n{', '.join(existing_tags)}"
            if existing_tags else ""
        )
        prompt = f"{VIDEO_ANALYSIS_PROMPT}{tags_context}"

        contents = [
            types.Part(file_data=types.FileData(file_uri=watch_url)),
            prompt,
        ]
        # Low media resolution (~100 tokens/sec) keeps cost and latency bounded
        # while remaining ample for understanding speech and on-screen content.
        return self._generate_json(
            contents,
            "youtube video analysis",
            config_extra={"media_resolution": "MEDIA_RESOLUTION_LOW"},
            attempts=attempts,
        )

    def analyze_image(self, image_bytes: bytes, mime_type: str, existing_tags: list = None,
                      attempts: int = _MAX_GENERATE_ATTEMPTS) -> dict:
        """Analyze image content using Gemini vision. Raises AnalysisError on failure.

        `attempts` is threaded to _generate_json (synchronous callers pass 2)."""
        tags_context = (
            f"\n\nExisting Tags in Brain (Reuse these if possible):\n{', '.join(existing_tags)}"
            if existing_tags else ""
        )

        prompt = f"""{SYSTEM_PROMPT}{tags_context}

Based on the image provided, extract the text and analyze it according to the instructions above.
If the image contains a tweet or social media post, extract the content as if it were the text.
If the image is an article, extract the headline and body."""

        from google.genai import types

        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ]
        return self._generate_json(contents, "image analysis", attempts=attempts)

    def _answer_json(self, prompt: str, what: str, attempts: int) -> dict:
        """One grounded-answer generation call, with a model fallback.

        Tries the higher-tier GEMINI_ASK_MODEL first; if that call fails
        outright (after _generate_json's own transient retries), re-runs the
        SAME prompt on GEMINI_ANALYSIS_MODEL — the tier every save/analysis
        call already exercises in production. The ask tier is the ONLY place
        the higher model id is used, so a bad/unavailable model there must
        degrade Ask to the proven tier, not hard-fail every question with an
        opaque 500. Raises AnalysisError only when BOTH models fail.
        """
        try:
            return self._generate_json([prompt], what,
                                       config_extra={"response_schema": BrainAnswer},
                                       model=GEMINI_ASK_MODEL, attempts=attempts)
        except AnalysisError as e:
            logger.error("Ask model %s failed for %s — falling back to %s: %s",
                         GEMINI_ASK_MODEL, what, GEMINI_ANALYSIS_MODEL, e)
            return self._generate_json([prompt], f"{what} (fallback model)",
                                       config_extra={"response_schema": BrainAnswer},
                                       model=GEMINI_ANALYSIS_MODEL, attempts=attempts)

    def answer_from_context(self, question: str, cards: list, history: list = None,
                            attempts: int = _MAX_GENERATE_ATTEMPTS) -> dict:
        """Answer a user question grounded ONLY in their saved cards (RAG).

        `cards` is a list of dicts with id/title/summary/category/tags. Returns
        {"answer": str, "citedIds": [str], "ungrounded": bool}. Raises
        AnalysisError on failure.

        The whole point of a Machina AI answer is trust: the model must
        speak only from what the user actually saved, and cite it. Generation is
        schema-constrained (BrainAnswer) so the model returns valid, fully
        escaped JSON even when the answer contains quotes or newlines — a plain
        response_mime_type call breaks on such content (notably Hebrew).

        Citations are a hard invariant here (buffered path): if the first answer
        cites nothing valid, we re-ask ONCE with a stricter prompt. If the retry
        still cites nothing, we do NOT fail the request — we return the answer
        with ``ungrounded=True`` and empty citedIds so the client can downgrade
        honestly instead of presenting an unverifiable answer as grounded. The
        empty-library case is NOT ungrounded (there was nothing to cite).
        """
        if not self.client:
            raise AnalysisError("Gemini API key is not configured (GEMINI_API_KEY).")

        if not cards:
            return {
                "answer": "I couldn't find anything in your library about that yet. "
                          "Try saving a few links on the topic, then ask me again.",
                "citedIds": [],
                "ungrounded": False,
            }

        prompt = _build_rag_prompt(question, cards, history) + _CITED_JSON_SUFFIX
        data = self._answer_json(prompt, "answer", attempts)
        answer = data.get("answer") or ""
        cited = _valid_cited_ids(data.get("citedIds"), cards)
        if cited:
            return {"answer": answer, "citedIds": cited, "ungrounded": False}

        # No valid citation on the first pass. Re-ask ONCE with a stricter prompt
        # that demands the model name the ids it relied on. A transient failure
        # here must not sink the request — fall through to the ungrounded return.
        retry_prompt = _build_rag_prompt(question, cards, history) + _CITED_JSON_STRICT_SUFFIX
        try:
            retry = self._answer_json(retry_prompt, "answer (citation retry)", attempts)
            retry_answer = retry.get("answer") or ""
            retry_cited = _valid_cited_ids(retry.get("citedIds"), cards)
            if retry_cited:
                return {"answer": retry_answer, "citedIds": retry_cited, "ungrounded": False}
        except AnalysisError as e:
            logger.warning(f"ask citation retry failed: {e}")

        # Still uncited after the retry: keep the (best) answer but flag it so the
        # UI drops the "grounded" promise rather than shipping a confident,
        # unverifiable answer with no source chips.
        logger.warning("ask answer returned no valid citations after retry — flagging ungrounded")
        return {"answer": answer, "citedIds": [], "ungrounded": True}

    def answer_from_context_stream(self, question: str, cards: list, history: list = None):
        """Streaming variant of `answer_from_context` (RAG over saved cards).

        Yields ("token", text) tuples as the answer streams in, then a final
        ("citedIds", [str]) tuple with the ids the model used, and — when the
        answer ended up with NO valid citation — a trailing ("ungrounded", True)
        tuple. Reuses the same grounding/system instructions as
        `answer_from_context` so answer quality and Hebrew handling are preserved.

        Because schema-constrained JSON cannot be streamed token-by-token, the
        model instead writes a plain-text answer and ends with a machine-readable
        marker line `[[CITED: id1, id2]]`. We buffer the tail of the stream so the
        marker is never surfaced to the user, and parse it at the end to derive
        citations. If the marker is missing/unparseable we cite NOTHING (empty
        list) — mirroring the non-streaming path — rather than over-crediting the
        answer to every retrieved card.

        Citations are the same hard invariant as the buffered path, but the
        streaming path CANNOT re-ask: the prose has already been streamed to the
        client token-by-token, so a full re-ask mid-stream is not possible.
        Instead we flag it after the fact — a final ("ungrounded", True) event —
        and let the UI downgrade the already-rendered answer. (A retry would mean
        buffering the whole answer and defeating streaming; the flag is the
        smallest correct design here. The buffered/native path does the re-ask.)
        The empty-library case is NOT flagged ungrounded — there was nothing to
        cite — matching `answer_from_context`.

        On mid-stream failure this raises AnalysisError; callers should wrap the
        consumption in a try/except and emit a sanitized error to the client.
        """
        if not self.client:
            raise AnalysisError("Gemini API key is not configured (GEMINI_API_KEY).")

        if not cards:
            yield ("token",
                   "I couldn't find anything in your library about that yet. "
                   "Try saving a few links on the topic, then ask me again.")
            yield ("citedIds", [])
            return

        prompt = _build_rag_prompt(question, cards, history) + (
            "Write the answer as plain text (no JSON). Then, on a NEW LINE after "
            "the answer, output a citation marker listing the ids (without "
            "brackets) of the sources you relied on, in exactly this format:\n"
            "[[CITED: id1, id2]]\n"
            "Output the marker exactly once, as the very last line, and nothing after it."
        )

        # Tail buffer: hold back the trailing characters that could be the start
        # of the "[[CITED: ...]]" marker so it is never streamed as visible text.
        # We keep at least the marker's full prefix length buffered at all times.
        MARKER = "[[CITED:"

        def _safe_emit_point(buf: str) -> int:
            """Return how many leading chars of `buf` are safe to emit now —
            i.e. cannot be part of an as-yet-incomplete marker at the tail."""
            # If the marker is fully present, caller handles it separately.
            idx = buf.find(MARKER)
            if idx != -1:
                return idx
            # Otherwise withhold any suffix that could be the start of the marker.
            for keep in range(min(len(MARKER) - 1, len(buf)), 0, -1):
                if buf.endswith(MARKER[:keep]):
                    return len(buf) - keep
            return len(buf)

        # Model fallback, mirroring _answer_json: the ask tier is the ONLY user
        # of GEMINI_ASK_MODEL, so if it fails we retry the whole stream on the
        # production-proven analysis model — but only while NOTHING has been
        # yielded to the consumer yet (text held in the tail buffer is fine; it
        # was never surfaced). After the first emitted token a restart would
        # duplicate prose, so mid-stream failures still raise.
        full_text = ""
        for fallback_model in (None, GEMINI_ANALYSIS_MODEL):
            # Per-attempt state: a failed first attempt must not leak partial
            # accumulation into the fallback run.
            buffer = ""
            full_text = ""
            marker_seen = False
            emitted = False
            try:
                stream = self.client.models.generate_content_stream(
                    # Higher-tier ASK model (see GEMINI_ASK_MODEL) first,
                    # matching the non-streaming answer path.
                    model=fallback_model or GEMINI_ASK_MODEL,
                    contents=[prompt],
                    # Match the non-streaming answer path: this is a grounded,
                    # factual answer, so keep temperature low for stability. Without
                    # this the stream would silently run at the ~1.0 default.
                    config={"temperature": 0.2},
                )
                for chunk in stream:
                    piece = getattr(chunk, "text", None)
                    if not piece:
                        continue
                    full_text += piece
                    if marker_seen:
                        # Past the marker — accumulate into full_text only, emit nothing.
                        continue
                    buffer += piece
                    marker_idx = buffer.find(MARKER)
                    if marker_idx != -1:
                        # Emit everything before the marker, then stop emitting.
                        head = buffer[:marker_idx]
                        if head:
                            emitted = True
                            yield ("token", head)
                        marker_seen = True
                        buffer = ""
                        continue
                    emit_to = _safe_emit_point(buffer)
                    if emit_to > 0:
                        emitted = True
                        yield ("token", buffer[:emit_to])
                        buffer = buffer[emit_to:]
                # Flush any remaining buffered text that turned out not to be a marker.
                if not marker_seen and buffer:
                    yield ("token", buffer)
                break  # this model completed — don't try the fallback
            except Exception as e:
                if emitted or fallback_model is not None:
                    logger.error(f"Gemini answer stream failed: {e}")
                    raise AnalysisError(f"AI answer failed: {e}")
                logger.error("Ask model %s stream failed before any output — "
                             "falling back to %s: %s",
                             GEMINI_ASK_MODEL, GEMINI_ANALYSIS_MODEL, e)

        # Parse the citation marker out of the accumulated full text, then keep
        # only ids the model actually named that we in fact supplied. If the
        # [[CITED:]] marker is missing, unparseable, or names nothing valid, cite
        # NOTHING (empty list) — the old fallback re-cited EVERY supplied id,
        # attributing the answer to cards the model may never have used.
        cited = _valid_cited_ids(_parse_cited_marker(full_text), cards)
        yield ("citedIds", cited)

        # No valid citation → the answer can't be proven grounded in the saves.
        # We can't re-ask (tokens already streamed), so flag it for the UI. cards
        # is non-empty here (the empty-library case returned early above), so an
        # empty `cited` unambiguously means "uncited", not "nothing to cite".
        if not cited:
            logger.warning("ask stream produced no valid citations — flagging ungrounded")
            yield ("ungrounded", True)

    def synthesize_week(self, cards: list) -> dict:
        """Write a narrative "What you learned this week" synthesis over `cards`.

        `cards` is a list of dicts with id/title/summary/category/tags/concepts —
        the items the user saved during the week. Returns a dict matching the
        WeeklySynthesis schema: {title, narrative, themes[], standoutCardId,
        standoutReason, openQuestion}. Every theme and the standout reference the
        real card ids passed in, so the caller can link back to the sources.

        This is the retention/word-of-mouth surface (M12): it must read like a
        thoughtful debrief a person would screenshot and forward, NOT a list of
        links. Raises AnalysisError on failure so the caller can skip delivery
        rather than send a broken recap.
        """
        if not self.client:
            raise AnalysisError("Gemini API key is not configured (GEMINI_API_KEY).")
        if not cards:
            raise AnalysisError("No cards to synthesize")

        def _card_block(c: dict) -> str:
            concepts = ", ".join(c.get("concepts") or [])
            tags = ", ".join(c.get("tags") or [])
            meta = f"category: {c.get('category', 'General')}"
            if concepts:
                meta += f"; concepts: {concepts}"
            if tags:
                meta += f"; tags: {tags}"
            return (
                f"[{c.get('id')}] {c.get('title', 'Untitled')} ({meta})\n"
                f"{(c.get('summary') or '').strip()}"
            )

        sources_text = "\n\n".join(_card_block(c) for c in cards)
        valid_ids = {c.get("id") for c in cards if c.get("id")}

        prompt = f"""You are Machina AI, the user's personal knowledge companion. Below are the {len(cards)} things this person saved this week — their reading, in their own library. Write them a short, warm "What you learned this week" recap.

This is the highlight of their week with the app, so it must read like a thoughtful debrief from a smart friend who actually read everything — NOT a list of links or a bullet dump. Find the real throughline.

Rules:
- Ground everything ONLY in the saved cards below. Do NOT invent facts, statistics, or claims that aren't in a card's title/summary.
- Write the narrative as 2-4 short paragraphs that connect the week's saves into a story: what themes emerged, how ideas related or tensioned, what the arc of the week was. Be specific — name the actual ideas, not "you read some interesting things."
- Identify 2-4 themes. Each theme references the ids of the cards that fed it.
- Pick ONE standout card (the most noteworthy save) and say in one sentence why.
- End with ONE genuine open question the week's reading raises — something worth carrying into next week.
- Warm and human, but never sycophantic or salesy. No "amazing", "incredible", "must-read".
- Match the user's language: if most cards are in Hebrew, write the recap in Hebrew; otherwise English.
- Every id you reference MUST be one of the ids shown in brackets below. Never invent ids.

This week's saves:
{sources_text}

Return ONLY a JSON object matching the schema (title, narrative, themes[title,insight,cardIds], standoutCardId, standoutReason, openQuestion)."""

        data = self._generate_json(
            [prompt], "weekly synthesis",
            # Unlike the extraction paths, this surface is deliberately a warm,
            # narrative debrief — hold it ABOVE the 0.2 extraction default so the
            # prose doesn't go flat, while staying grounded by the prompt's rules.
            config_extra={"response_schema": WeeklySynthesis, "temperature": 0.6},
        )

        # Guard against hallucinated ids — keep only ones we actually supplied.
        themes = []
        for t in (data.get("themes") or []):
            if not isinstance(t, dict):
                continue
            ids = [i for i in (t.get("cardIds") or []) if i in valid_ids]
            themes.append({
                "title": t.get("title") or "",
                "insight": t.get("insight") or "",
                "cardIds": ids,
            })
        standout = data.get("standoutCardId")
        if standout not in valid_ids:
            standout = None
        return {
            "title": data.get("title") or "What you learned this week",
            "narrative": data.get("narrative") or "",
            "themes": themes,
            "standoutCardId": standout,
            "standoutReason": data.get("standoutReason") or "",
            "openQuestion": data.get("openQuestion") or "",
        }

    def embed_text(self, text: str) -> Optional[List[float]]:
        """Generate a vector embedding for text using Gemini.

        Always embeds as RETRIEVAL_DOCUMENT: every caller embeds CARD content
        (the analyze pipelines writing `embedding_vector`, graph_service
        comparing cards to stored card vectors), so all stored vectors live in
        one space and search queries pair with them via RETRIEVAL_QUERY — see
        search.EmbeddingService.generate_embedding / EMBED_TEXT_VERSION v5.

        Returns `None` on failure (no client, or the API errored) rather than a
        zero-ish sentinel. Callers MUST treat `None` as "no embedding": omit the
        `embedding_vector` field and set `needsEmbedding=True` so a backfill can
        find and repair the card later. Writing a fake near-zero vector instead
        (the old behaviour) poisoned search — the card looked embedded, ranked
        against everything at random, and no backfill could tell it apart from a
        real embedding. Embeddings are non-critical (search/related links
        degrade gracefully), so failure never throws away a good analysis.
        """
        if not self.client:
            logger.warning("Gemini client not initialized — skipping embedding")
            return None

        for attempt in range(_MAX_EMBED_ATTEMPTS):
            try:
                result = self.client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=text[:9000],
                    config={"output_dimensionality": EMBEDDING_DIMENSIONS,
                            "task_type": "RETRIEVAL_DOCUMENT"}
                )
                return result.embeddings[0].values
            except Exception as e:
                logger.error(f"Embedding generation failed (attempt {attempt + 1}): {e}")
                # Short backoff, and only for transient errors while attempts
                # remain. Preserve the None-on-failure contract callers depend on.
                if attempt < _MAX_EMBED_ATTEMPTS - 1 and _is_retryable_error(e):
                    time.sleep(0.5 + random.uniform(0, 0.5))
                    continue
                return None
        return None
