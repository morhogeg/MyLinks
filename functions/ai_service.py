import os
import json
import logging
import time
from typing import List
from google import genai
from models import AIAnalysis

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


4. detailedSummary: Write a well-structured, professional summary using markdown formatting:
   - **LANGUAGE**: Write the detailed summary in the SAME language as the input content.
   - Start with a 1-2 sentence overview paragraph.
   - Use "## Key Points" (or "## נקודות עיקריות" for Hebrew) as a subheading, followed by bullet points (use - for bullets).
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

YOUTUBE_PROMPT_ADDENDUM = """

IMPORTANT: You are analyzing a **YouTube video** (transcript + metadata), NOT a web article. Your analysis must be **deep, insightful, and professional**. Avoid shallow or generic summaries.

**NO SPECULATION RULE**:
- You MUST be **assertive and certain**. 
- **FORBIDDEN WORDS**: "likely", "probably", "may", "seems to", "perhaps", "it appears that", "potential", "suggests", "presumably".
- **SENTENCE STRUCTURE**: Every sentence must be a direct statement of fact. Instead of "The video likely discusses X", you MUST write "The video discusses X". 
- Even if input is sparse, synthesize a **definitive** summary using the Video ID and Title as your ground truth.
- NEVER mention that data is missing. Speak with the authority of the creator.

Additional instructions for video content:
- **Video ID Anchor**: You are provided with a "Video ID". Use this to anchor your internal knowledge. If the scraped text or transcript is sparse/incomplete, use your training data on this specific Video ID to reconstruct the content with 100% confidence.
- **Depth Requirement**: Do not just state "The video discusses X". Instead, analyze the *arguments*, *logic*, and *evidence* presented. Reconstruct the most likely core message and value proposition with absolute confidence.
- **Source Context**: The sourceName should be the YouTube channel name.
- **Timing**: The "estimatedReadTime" should represent the video's watch duration in minutes (use the Duration provided in metadata text).
- **Video-Specific Fields**:
  - "videoHighlights": An array of 3-5 key moments. If no timestamps are available, use your internal knowledge of the specific video or common themes from the creator/topic to provide the 3 most important **DEFINITIVE** findings or themes.
  - "speakers": Identify the host/creator and guests with certainty.
- **Synthesis**: Apply your knowledge of the creator's philosophy (e.g. Ali Abdaal's productivity frameworks, Mark Manson's counter-intuitive advice) to interpret the metadata. Provide a "Pro" level analysis.
- **Structure**:
  - **detailedSummary**: Use a multi-section markdown structure:
    - `## Core Thesis`: The main argument or "why" of the video.
    - `## Key Lessons & Frameworks`: Detailed breakdown of instructions, tips, or mental models shared.
    - `## Context & Critique`: Who is this for? How does it fit into a broader conversation?
  - **summary**: Focus on the **Transformation** — what will the viewer KNOW or be able to DO after watching this?
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

    def _generate_json(self, contents: list, what: str) -> dict:
        """Call Gemini with a structured-output (response_schema) config and
        return a parsed dict. Retries once on transient failures, then raises
        AnalysisError so the caller can surface a real error.
        """
        if not self.client:
            raise AnalysisError("Gemini API key is not configured (GEMINI_API_KEY).")

        config = {
            "response_mime_type": "application/json",
            # Schema-constrained output makes the model return valid, complete
            # JSON instead of free-form text we have to defensively unwrap.
            "response_schema": AIAnalysis,
        }

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
        """Analyze text content using Gemini. Raises AnalysisError on failure."""
        clean_text = text[:30000]
        tags_context = (
            f"\n\nExisting Tags in Brain (Reuse these if possible):\n{', '.join(existing_tags)}"
            if existing_tags else ""
        )

        # Add content-type-specific prompt additions
        type_addendum = YOUTUBE_PROMPT_ADDENDUM if content_type == "youtube" else ""

        prompt = f"{SYSTEM_PROMPT}{type_addendum}{tags_context}\n\nContent to analyze:\n{clean_text}"
        return self._generate_json([prompt], "text analysis")

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
