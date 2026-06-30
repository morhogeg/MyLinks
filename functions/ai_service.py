import os
import json
import logging
import time
from typing import List
from google import genai
from models import AIAnalysis, BrainAnswer

logger = logging.getLogger(__name__)

# Single source of truth for the analysis/generation model. Flows to text
# analysis, image vision, and graph_service. Change here to swap tiers everywhere.
GEMINI_ANALYSIS_MODEL = "gemini-3.1-flash-lite"
EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


class AnalysisError(Exception):
    """Raised when AI analysis genuinely fails so callers can surface a real
    error instead of silently saving a junk 'Analysis Failed' card."""

# Professional system prompt
SYSTEM_PROMPT = """You are a professional knowledge extraction assistant for a "Second Brain" system.
Your goal is to objectively summarize web content with accuracy and precision. Do NOT add opinions, interpretations, or subjective assessments.

Output MUST be a valid JSON object only.

Requirements for the analysis:

1. language: Identify the primary language of the content. Use ISO 639-1 codes (e.g., "he" for Hebrew, "en" for English).

2. title: Create a concise, descriptive title that captures the core topic. Be factual, not clickbait.
   - **LANGUAGE**: Write the title in the SAME language as the input content.

3. summary: Write 2 to 4 concise, information-dense sentences for a card preview. 
   - **LANGUAGE**: Write the summary in the SAME language as the input content.
   - **SCANNABILITY**: Use **bolding** (double asterisks) for key terms, dates, or names to make them pop.
   - **STRUCTURE**: Add a line break (\\\\n) between each sentence to create visual separation.
   - Summarize ONLY what the content explicitly states.
   - NO opinions, NO value judgments.
   - Each sentence must end with a period.
   - You MAY use a single bullet point if it makes a critical finding clearer.
   
   GOOD: "Researchers at **MIT** found that **intermittent fasting** reduced inflammation markers by **40%** in a 12-week trial.\\n\\nThe study showed benefits appeared after just **2 weeks**."

   - **RECIPE FOCUS**: If the content is a recipe or cooking video, the title and summary MUST center on the dish itself — what it is, its key ingredients, and how it is made. Treat the author's personal or dietary framing (e.g. "since I went keto…", "I make these for my kids") as secondary background, NOT the headline. Lead with the food, not the lifestyle commentary.


4. detailedSummary: Write a well-structured, professional summary using markdown formatting:
   - **LANGUAGE**: Write the detailed summary in the SAME language as the input content.
   - Start with a 1-2 sentence overview paragraph.
   - Use "## Key Points" (or "## נקודות עיקריות" for Hebrew) as a subheading, followed by bullet points (use - for bullets).
   - **FORMATTING**: Every "##" subheading MUST start on its own new line with a blank line before it. NEVER place a "##" heading on the same line as the preceding sentence.
   - Each bullet should be a factual statement from the content.
   - Include 3-6 bullet points covering the main arguments or information.
   - If applicable, add "## Conclusions" (or "## מסקנות" for Hebrew) with the author's stated conclusions.
   - Keep the tone neutral and professional throughout.
   - Total length: 150-300 words.

5. sourceName: Extract the name of the source or publisher (e.g., CNN, The New York Times, X, Reddit, Wikipedia, YouTube, TikTok).
   - For images or screenshots that don't reveal a source, use "Screenshot".
   - **CRITICAL**: The sourceName MUST ALWAYS be in English or its original brand name.

6. category: Assign exactly one high-level category (e.g., Tech, Health, Philosophy, Business, Research, Science, Finance, Productivity, Design, Career). If the content is a recipe, use "Recipe".
   - **CRITICAL**: The category MUST ALWAYS be in English, even if the content is in another language.

7. tags: Provide exactly 3 or 4 specific, relevant tags for organization.
   - **LANGUAGE**: Write tags in the SAME language as the input content.
   - Use lowercase.
   - PREFER REUSING EXISTING TAGS provided in the "Existing Tags" list if they are applicable.
   - Only create a new tag if no existing tags fit the content.

8. actionableTakeaway: One concrete, specific action or learning the reader can apply.
   - **LANGUAGE**: Write the takeaway in the SAME language as the input content.

CRITICAL RULES:
- Be a neutral reporter, not a reviewer. Report WHAT is said, not HOW WELL it is said.
- Avoid subjective phrases like: "offers valuable insights", "provides a comprehensive overview", "explores interesting ideas", "is a must-read", "excellently explains".
- Use factual language: "The article discusses...", "The author argues...", "The research shows...", "Key topics include...".

9. concepts: Identify 3-5 "Philosophical Anchors" or "Abstract Concepts".
   - **LANGUAGE**: English (always).
   - These should be high-level mental models or themes, not just keywords.
   - Example: "Spaced Repetition", "Pareto Principle", "Stoicism", "Network Effects", "Opportunity Cost".
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
- "detailedSummary": markdown with these sections:
  - `## Core Thesis` — the central argument or purpose of the video.
  - `## Key Points` — bullets of the main ideas, instructions, or frameworks actually presented.
  - `## Who It's For` — the intended audience, only if the video makes this clear.
- "summary": focus on the takeaway — what a viewer will know or be able to do after watching, stated factually.
"""


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

    def _generate_json(self, contents: list, what: str, config_extra: dict = None) -> dict:
        """Call Gemini with a structured-output (response_schema) config and
        return a parsed dict. Retries once on transient failures, then raises
        AnalysisError so the caller can surface a real error.

        config_extra lets callers add generation options (e.g. media_resolution
        for video) without changing the base structured-output config.
        """
        if not self.client:
            raise AnalysisError("Gemini API key is not configured (GEMINI_API_KEY).")

        config = {
            "response_mime_type": "application/json",
            # Schema-constrained output makes the model return valid, complete
            # JSON instead of free-form text we have to defensively unwrap.
            "response_schema": AIAnalysis,
        }
        if config_extra:
            config.update(config_extra)

        last_error = None
        for attempt in range(2):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
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
                if attempt == 0:
                    time.sleep(0.75)  # brief backoff before the single retry

        logger.error(f"Gemini {what} failed after retries: {last_error}")
        raise AnalysisError(f"AI {what} failed: {last_error}")

    def analyze_text(self, text: str, existing_tags: list = None, content_type: str = None) -> dict:
        """Analyze text content using Gemini. Raises AnalysisError on failure.

        content_type is accepted for caller compatibility; video content is
        handled by analyze_youtube (native video ingestion), so no special
        text addendum is applied here.
        """
        clean_text = text[:30000]
        tags_context = (
            f"\n\nExisting Tags in Brain (Reuse these if possible):\n{', '.join(existing_tags)}"
            if existing_tags else ""
        )

        prompt = f"{SYSTEM_PROMPT}{tags_context}\n\nContent to analyze:\n{clean_text}"
        return self._generate_json([prompt], "text analysis")

    def analyze_youtube(self, watch_url: str, existing_tags: list = None) -> dict:
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
        )

    def analyze_image(self, image_bytes: bytes, mime_type: str, existing_tags: list = None) -> dict:
        """Analyze image content using Gemini vision. Raises AnalysisError on failure."""
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
        return self._generate_json(contents, "image analysis")

    def answer_from_context(self, question: str, cards: list, history: list = None) -> dict:
        """Answer a user question grounded ONLY in their saved cards (RAG).

        `cards` is a list of dicts with id/title/summary/category/tags. Returns
        {"answer": str, "citedIds": [str]}. Raises AnalysisError on failure.

        The whole point of a "Second Brain" answer is trust: the model must
        speak only from what the user actually saved, and cite it. Generation is
        schema-constrained (BrainAnswer) so the model returns valid, fully
        escaped JSON even when the answer contains quotes or newlines — a plain
        response_mime_type call breaks on such content (notably Hebrew).
        """
        if not self.client:
            raise AnalysisError("Gemini API key is not configured (GEMINI_API_KEY).")

        if not cards:
            return {
                "answer": "I couldn't find anything in your library about that yet. "
                          "Try saving a few links on the topic, then ask me again.",
                "citedIds": [],
            }

        def _source_label(c: dict) -> str:
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

        def _card_block(c: dict) -> str:
            src = _source_label(c)
            meta = [f"source: {src}"] if src else []
            meta.append(f"category: {c.get('category', 'General')}")
            meta.append(f"tags: {', '.join(c.get('tags', []) or [])}")
            return (
                f"[{c.get('id')}] {c.get('title', 'Untitled')} "
                f"({'; '.join(meta)})\n{c.get('summary', '')}"
            )

        sources_text = "\n\n".join(_card_block(c) for c in cards)

        history_text = ""
        if history:
            turns = []
            for h in history[-6:]:  # keep the prompt bounded
                role = "User" if h.get("role") == "user" else "Assistant"
                turns.append(f"{role}: {h.get('content', '')}")
            history_text = "\n\nEarlier in this conversation:\n" + "\n".join(turns)

        prompt = f"""You are the user's "Second Brain" assistant. Answer the question USING ONLY the saved sources below — these are links and notes the user personally saved.

Rules:
- Ground every claim in the provided sources. Do NOT use outside knowledge or invent facts.
- If the sources don't contain the answer, say so plainly and suggest what they could save.
- Be concise and direct (2-5 sentences, or a short list when that's clearer).
- Don't announce a count of items (e.g. "three sources") — just give the list. If you do state a number, it MUST exactly match the number of items you list.
- CRITICAL — match the user's language: write your ENTIRE answer in the same language as the User question, NOT the language of the sources. If the question is in English, answer in English even when every source is in Hebrew; if the question is in Hebrew, answer in Hebrew. The sources' language must not influence your answer's language.
- Only cite sources you actually used.

Saved sources:
{sources_text}
{history_text}

User question: {question}

Return ONLY a JSON object: {{"answer": string, "citedIds": string[]}} where citedIds are the ids (without brackets) of the sources you relied on."""

        data = self._generate_json([prompt], "answer", config_extra={"response_schema": BrainAnswer})

        answer = data.get("answer") or ""
        cited = data.get("citedIds") or []
        # Guard against hallucinated ids — keep only ones we actually supplied.
        valid_ids = {c.get("id") for c in cards}
        cited = [cid for cid in cited if cid in valid_ids]
        return {"answer": answer, "citedIds": cited}

    def answer_from_context_stream(self, question: str, cards: list, history: list = None):
        """Streaming variant of `answer_from_context` (RAG over saved cards).

        Yields ("token", text) tuples as the answer streams in, then a final
        ("citedIds", [str]) tuple with the ids the model used. Reuses the same
        grounding/system instructions as `answer_from_context` so answer quality
        and Hebrew handling are preserved.

        Because schema-constrained JSON cannot be streamed token-by-token, the
        model instead writes a plain-text answer and ends with a machine-readable
        marker line `[[CITED: id1, id2]]`. We buffer the tail of the stream so the
        marker is never surfaced to the user, and parse it at the end to derive
        citations. If the marker is missing/unparseable we fall back to citing all
        supplied card ids (so sources are never empty when cards exist).

        On mid-stream failure this raises AnalysisError; callers should wrap the
        consumption in a try/except and emit a sanitized error to the client.
        """
        if not self.client:
            raise AnalysisError("Gemini API key is not configured (GEMINI_API_KEY).")

        valid_ids = [c.get("id") for c in cards if c.get("id")]

        if not cards:
            yield ("token",
                   "I couldn't find anything in your library about that yet. "
                   "Try saving a few links on the topic, then ask me again.")
            yield ("citedIds", [])
            return

        # Reuse the exact source/history framing from answer_from_context so the
        # grounded answer is identical in quality to the non-streaming path.
        def _source_label(c: dict) -> str:
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

        def _card_block(c: dict) -> str:
            src = _source_label(c)
            meta = [f"source: {src}"] if src else []
            meta.append(f"category: {c.get('category', 'General')}")
            meta.append(f"tags: {', '.join(c.get('tags', []) or [])}")
            return (
                f"[{c.get('id')}] {c.get('title', 'Untitled')} "
                f"({'; '.join(meta)})\n{c.get('summary', '')}"
            )

        sources_text = "\n\n".join(_card_block(c) for c in cards)

        history_text = ""
        if history:
            turns = []
            for h in history[-6:]:  # keep the prompt bounded
                role = "User" if h.get("role") == "user" else "Assistant"
                turns.append(f"{role}: {h.get('content', '')}")
            history_text = "\n\nEarlier in this conversation:\n" + "\n".join(turns)

        prompt = f"""You are the user's "Second Brain" assistant. Answer the question USING ONLY the saved sources below — these are links and notes the user personally saved.

Rules:
- Ground every claim in the provided sources. Do NOT use outside knowledge or invent facts.
- If the sources don't contain the answer, say so plainly and suggest what they could save.
- Be concise and direct (2-5 sentences, or a short list when that's clearer).
- Don't announce a count of items (e.g. "three sources") — just give the list. If you do state a number, it MUST exactly match the number of items you list.
- CRITICAL — match the user's language: write your ENTIRE answer in the same language as the User question, NOT the language of the sources. If the question is in English, answer in English even when every source is in Hebrew; if the question is in Hebrew, answer in Hebrew. The sources' language must not influence your answer's language.
- Only cite sources you actually used.

Saved sources:
{sources_text}
{history_text}

User question: {question}

Write the answer as plain text (no JSON). Then, on a NEW LINE after the answer, output a citation marker listing the ids (without brackets) of the sources you relied on, in exactly this format:
[[CITED: id1, id2]]
Output the marker exactly once, as the very last line, and nothing after it."""

        # Tail buffer: hold back the trailing characters that could be the start
        # of the "[[CITED: ...]]" marker so it is never streamed as visible text.
        # We keep at least the marker's full prefix length buffered at all times.
        MARKER = "[[CITED:"
        # Once we see the marker open we stop emitting and accumulate the rest.
        buffer = ""
        full_text = ""
        marker_seen = False

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

        try:
            stream = self.client.models.generate_content_stream(
                model=self.model,
                contents=[prompt],
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
                        yield ("token", head)
                    marker_seen = True
                    buffer = ""
                    continue
                emit_to = _safe_emit_point(buffer)
                if emit_to > 0:
                    yield ("token", buffer[:emit_to])
                    buffer = buffer[emit_to:]
            # Flush any remaining buffered text that turned out not to be a marker.
            if not marker_seen and buffer:
                yield ("token", buffer)
        except Exception as e:
            logger.error(f"Gemini answer stream failed: {e}")
            raise AnalysisError(f"AI answer failed: {e}")

        # Parse the citation marker out of the accumulated full text.
        cited = []
        try:
            import re as _re
            m = _re.search(r"\[\[CITED:(.*?)\]\]", full_text, _re.DOTALL)
            if m:
                raw = m.group(1)
                cited = [t.strip() for t in raw.split(",") if t.strip()]
        except Exception:
            cited = []

        valid_set = set(valid_ids)
        cited = [cid for cid in cited if cid in valid_set]
        # Never leave sources empty when we did have cards to ground on.
        if not cited:
            cited = list(valid_ids)
        yield ("citedIds", cited)

    def embed_text(self, text: str) -> List[float]:
        """Generate vector embedding for text using Gemini.

        Embeddings are non-critical (semantic search / related links degrade
        gracefully), so a zero-ish vector is returned on failure rather than
        raising — that keeps a good analysis from being thrown away.
        """
        if not self.client:
            logger.warning("Gemini client not initialized, returning mock embedding")
            return [1e-9] * EMBEDDING_DIMENSIONS

        try:
            result = self.client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text[:9000],
                config={"output_dimensionality": EMBEDDING_DIMENSIONS}
            )
            return result.embeddings[0].values
        except Exception as e:
            logger.error(f"Embedding generation failed: {str(e)}")
            return [1e-9] * EMBEDDING_DIMENSIONS


# Backward compatibility alias
ClaudeService = GeminiService
