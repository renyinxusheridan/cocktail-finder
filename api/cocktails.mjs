// Vercel runs this function when someone visits /api/cocktails.
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Only GET requests are allowed.' });
    }

    // Read the name from /api/cocktails?name=margarita.
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    if (!name) {
        return res.status(400).json({ error: 'Please enter a cocktail name.' });
    }

    // URLSearchParams safely handles spaces and special characters in the name.
    const url = new URL('https://www.thecocktaildb.com/api/json/v1/1/search.php');
    url.searchParams.set('s', name);

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
            throw new Error('TheCocktailDB request failed.');
        }

        const data = await response.json();
        // Keep the original { drinks: [...] } or { drinks: null } response.
        if (!data || (data.drinks !== null && !Array.isArray(data.drinks))) {
            throw new Error('Unexpected cocktail data.');
        }
        return res.status(200).json(data);
    } catch (error) {
        return res.status(502).json({ error: 'Unable to load cocktails. Please try again.' });
    }
}
