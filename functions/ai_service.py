"""
Claude AI Service for content analysis
TODO: Replace mock implementation with actual Claude API calls
"""

import os
import json
import re
from typing import Dict, Any
from models import AIAnalysis


# System prompt from PRD Section 4.2
SYSTEM_PROMPT = """You are an expert knowledge curator building a Second Brain.
Your role is to analyze web content and extract the most valuable insights.

Input: Raw text from a website.
Output: JSON only.

JSON Structure:
{
  "title": "Concise, punchy title",
  "summary": "A 3-sentence summary focusing on novel insights, not just describing the content.",
  "category": "One specific high-level category",
  "tags": ["tag1", "tag2", "tag3"],
  "actionable_takeaway": "One thing the user can do or learn from this."
}"""


class ClaudeService:
    """
    Wrapper for Anthropic Claude API
    Uses claude-3-5-sonnet-20240620 as specified in PRD
    """
    
    def __init__(self):
        # TODO: In production, get from Firebase Secrets:
        # firebase functions:secrets:set ANTHROPIC_API_KEY
        self.api_key = os.environ.get("ANTHROPIC_API_KEY")
        self.model = "claude-3-5-sonnet-20240620"
        
    def analyze_text(self, text: str) -> Dict[str, Any]:
        """
        Analyze text content and return structured insights
        
        Args:
            text: Raw text content from a webpage
            
        Returns:
            Dict matching AIAnalysis schema
        """
        if not self.api_key:
            # Fall back to mock if no API key
            return MockClaudeService().analyze_text(text)
        
        # TODO: Replace with actual Claude API call
        # Example implementation:
        # 
        # from anthropic import Anthropic
        # client = Anthropic(api_key=self.api_key)
        # 
        # response = client.messages.create(
        #     model=self.model,
        #     max_tokens=1024,
        #     system=SYSTEM_PROMPT,
        #     messages=[{"role": "user", "content": text}]
        # )
        # 
        # # Parse JSON from response
        # content = response.content[0].text
        # return json.loads(content)
        
        # For now, use mock
        return MockClaudeService().analyze_text(text)


class MockClaudeService:
    """
    Mock implementation for local testing without API calls
    Returns realistic responses based on content patterns
    """
    
    def analyze_text(self, text: str) -> Dict[str, Any]:
        """Generate mock analysis based on text content"""
        
        text_lower = text.lower()
        
        # Detect category from keywords
        category = "General"
        tags = ["reference", "bookmark"]
        
        if any(kw in text_lower for kw in ["github", "code", "programming", "api", "developer"]):
            category = "Tech"
            tags = ["programming", "development", "code"]
        elif any(kw in text_lower for kw in ["research", "study", "paper", "journal"]):
            category = "Research"
            tags = ["academic", "paper", "science"]
        elif any(kw in text_lower for kw in ["health", "medical", "fitness", "nutrition"]):
            category = "Health"
            tags = ["wellness", "health", "lifestyle"]
        elif any(kw in text_lower for kw in ["startup", "business", "company", "investment"]):
            category = "Business"
            tags = ["entrepreneurship", "business", "strategy"]
            
        # Extract potential title from content
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', text, re.IGNORECASE)
        title = title_match.group(1).strip()[:60] if title_match else "Untitled Link"
        
        return {
            "title": title,
            "summary": f"This resource covers important {category.lower()} insights. It provides practical information that can enhance your understanding. The content is well-organized and suitable for reference.",
            "category": category,
            "tags": tags[:3],
            "actionable_takeaway": f"Review this {category.lower()} content and identify key concepts to apply."
        }
