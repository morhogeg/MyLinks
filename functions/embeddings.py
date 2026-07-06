"""Single source of truth for the Gemini embedding model + raw embed call.

`ai_service.GeminiService.embed_text` and
`search.EmbeddingService.generate_embedding` share the same model/dimensions
and raw API call but deliberately keep different wrapper semantics
(ai_service truncates input and fails soft with a near-zero vector; search
sends the full text and raises). Only the constants and the raw call are
unified here — each wrapper keeps its own truncation and error handling.
"""

from typing import List

EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


def embed_content_raw(client, text: str) -> List[float]:
    """Call the Gemini embedding API and return the vector values.

    No truncation and no error handling here — callers own those semantics.
    """
    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config={"output_dimensionality": EMBEDDING_DIMENSIONS}
    )
    return result.embeddings[0].values
