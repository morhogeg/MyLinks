
import os
import json
from ai_service import ClaudeService

SAMPLE_RECIPE_HTML = """
<html>
<body>
    <h1>Classic Chocolate Chip Cookies</h1>
    <p>This is the best recipe for chocolate chip cookies. My grandmother used to make them every Sunday.</p>
    <div class="recipe-card">
        <h2>Ingredients</h2>
        <ul>
            <li>2 1/4 cups all-purpose flour</li>
            <li>1 tsp baking soda</li>
            <li>1 tsp salt</li>
            <li>1 cup butter, softened</li>
            <li>3/4 cup granulated sugar</li>
            <li>3/4 cup brown sugar</li>
            <li>1 tsp vanilla extract</li>
            <li>2 large eggs</li>
            <li>2 cups semi-sweet chocolate chips</li>
        </ul>
        <h2>Instructions</h2>
        <ol>
            <li>Preheat oven to 375°F.</li>
            <li>In a small bowl, combine flour, baking soda, and salt.</li>
            <li>In a large bowl, beat butter, granulated sugar, brown sugar, and vanilla extract until creamy.</li>
            <li>Add eggs, one at a time, beating well after each addition.</li>
            <li>Gradually beat in flour mixture.</li>
            <li>Stir in chocolate chips.</li>
            <li>Drop by rounded tablespoons onto ungreased baking sheets.</li>
            <li>Bake for 9 to 11 minutes or until golden brown.</li>
        </ol>
        <p>Servings: 24 cookies</p>
        <p>Prep time: 15 mins</p>
        <p>Cook time: 10 mins</p>
    </div>
</body>
</html>
"""

def test_recipe_extraction():
    # Ensure GEMINI_API_KEY is set in environment or mock it if needed
    service = ClaudeService()
    print("Testing recipe extraction...")
    analysis = service.analyze_text(SAMPLE_RECIPE_HTML)
    
    print("\nExtraction Results:")
    print(f"Title: {analysis.get('title')}")
    print(f"Category: {analysis.get('category')}")
    print(f"Tags: {analysis.get('tags')}")
    
    if 'recipe' in analysis and analysis['recipe']:
        recipe = analysis['recipe']
        print("\nStructured Recipe Found:")
        print(f"Servings: {recipe.get('servings')}")
        print(f"Prep Time: {recipe.get('prep_time')}")
        print(f"Cook Time: {recipe.get('cook_time')}")
        print(f"Ingredients count: {len(recipe.get('ingredients', []))}")
        print(f"Instructions count: {len(recipe.get('instructions', []))}")
        
        print("\nIngredients:")
        for ing in recipe.get('ingredients', []):
            print(f"- {ing}")
            
        print("\nInstructions:")
        for i, step in enumerate(recipe.get('instructions', []), 1):
            print(f"{i}. {step}")
    else:
        print("\nNo structured recipe found.")

if __name__ == "__main__":
    test_recipe_extraction()
