// Vercel runs this function when someone visits /api/cocktails.
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Only GET requests are allowed.' });
    }

    // Name searches take precedence; ingredient verification uses search.php?i=...
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    const letter = typeof req.query.letter === 'string' ? req.query.letter.trim().toLowerCase() : '';
    // Accept our frontend's ?ingredient=... and the documented search parameter ?i=...
    const ingredientQuery = req.query.ingredient ?? req.query.i;
    const ingredient = !name && typeof ingredientQuery === 'string' ? ingredientQuery.trim() : '';
    const ingredientList = !name && !ingredient && req.query.ingredients === 'list';
    if (!ingredientList && !ingredient && !name && !/^[a-z]$/.test(letter)) {
        return res.status(400).json({ error: 'Please enter a cocktail name, an ingredient name, or a single letter from A to Z.' });
    }
    if (ingredient) res.setHeader('Cache-Control', 'no-store');

    // URLSearchParams safely handles spaces and special characters in the name.
    const url = new URL(`https://www.thecocktaildb.com/api/json/v1/1/${ingredientList ? 'list' : 'search'}.php`);
    url.searchParams.set(ingredientList || ingredient ? 'i' : name ? 's' : 'f', ingredientList ? 'list' : ingredient || name || letter);

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
            throw new Error('TheCocktailDB request failed.');
        }

        const data = await response.json();
        // Ingredient search has a different envelope from recipe/list responses.
        // A successful no-match response is { ingredients: null }, not an error.
        if (ingredient) {
            if (!data || (data.ingredients !== null && !Array.isArray(data.ingredients)) ||
                (Array.isArray(data.ingredients) && data.ingredients.some(item =>
                    typeof item?.strIngredient !== 'string' || !item.strIngredient.trim()))) {
                throw new Error('Unexpected ingredient search data.');
            }
            return res.status(200).json(data);
        }
        // Keep the original { drinks: [...] } or { drinks: null } response.
        if (!data || (data.drinks !== null && !Array.isArray(data.drinks))) {
            throw new Error('Unexpected cocktail data.');
        }
        if (ingredientList && (!Array.isArray(data.drinks) || !data.drinks.length ||
            data.drinks.some(item => typeof item?.strIngredient1 !== 'string' || !item.strIngredient1.trim()))) {
            throw new Error('Unexpected ingredient data.');
        }
        return res.status(200).json(data);
    } catch (error) {
        return res.status(502).json({ error: ingredient ? 'Unable to verify this ingredient. Please try again.' : ingredientList
            ? 'Unable to load the ingredient list. Please try again.'
            : 'Unable to load cocktails. Please try again.' });
    }
}
