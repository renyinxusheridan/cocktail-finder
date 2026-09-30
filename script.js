const form = document.querySelector('#search-form');
const input = document.querySelector('#cocktail-name');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const resultsSection = document.querySelector('#results-section');
let activeController;
let latestRequest = 0;

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}


function makeElement(tag, text, className) {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
}

function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
}

function createRecipe(drink) {
    const name = cleanText(drink.strDrink) || 'Unnamed cocktail';
    const card = makeElement('article', '', 'recipe');
    const fallback = makeElement('p', 'Image unavailable', 'image-fallback');
    const imageUrl = cleanText(drink.strDrinkThumb);
    if (imageUrl && /^https:\/\//i.test(imageUrl)) {
        const image = makeElement('img', '', 'recipe-image');
        image.alt = name;
        image.loading = 'lazy';
        image.width = 400;
        image.height = 300;
        image.addEventListener('error', () => image.replaceWith(fallback), { once: true });
        image.src = imageUrl;
        card.append(image);
    } else {
        card.append(fallback);
    }

    const body = makeElement('div', '', 'recipe-body');
    const ingredients = makeElement('ul');
    
    for (let i = 1; i <= 15; i++) {
        const ingredient = cleanText(drink[`strIngredient${i}`]);
        const measure = cleanText(drink[`strMeasure${i}`]);
        if (ingredient) {
            ingredients.append(makeElement('li', measure ? `${measure} — ${ingredient}` : ingredient));
        }
    }
    body.append(makeElement('h3', name), makeElement('h4', 'Ingredients'));
    body.append(ingredients.children.length ? ingredients : makeElement('p', 'Ingredients unavailable.'));
    body.append(
        makeElement('h4', 'Instructions'),
        makeElement('p', cleanText(drink.strInstructions) || 'English instructions unavailable.', 'instructions')
    );
    card.append(body);
    return card;
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
   
    const requestId = ++latestRequest;
    if (activeController) activeController.abort();
    results.replaceChildren();
    resultsSection.setAttribute('aria-busy', 'false');
    const query = input.value.trim();
    input.removeAttribute('aria-invalid');
    if (!query) {
        input.setAttribute('aria-invalid', 'true');
        setStatus('Please enter a cocktail name.', 'error');
        input.focus();
        return;
    }

    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setStatus(`Searching for “${query}”…`, 'loading');
    resultsSection.setAttribute('aria-busy', 'true');

    try {
       
        const url = new URL('https://www.thecocktaildb.com/api/json/v1/1/search.php');
        url.searchParams.set('s', query);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (requestId !== latestRequest) return;
        if (!data || (data.drinks !== null && !Array.isArray(data.drinks))) {
            throw new Error('Unexpected API response');
        }
        const drinks = data.drinks || [];
        if (drinks.length === 0) {
            setStatus(`No cocktails found for “${query}”. Try another name.`);
            return;
        }
        const fragment = document.createDocumentFragment();
        for (const drink of drinks) fragment.append(createRecipe(drink));
        results.replaceChildren(fragment);
        setStatus(`Found ${drinks.length} ${drinks.length === 1 ? 'cocktail' : 'cocktails'} for “${query}”.`);
    } catch (error) {
        if (requestId !== latestRequest) return;
        setStatus(error.name === 'AbortError'
            ? 'The request timed out. Please try again.'
            : 'Unable to load recipes. Check your connection and try again.', 'error');
    } finally {
        clearTimeout(timeout);
        if (requestId === latestRequest) {
            resultsSection.setAttribute('aria-busy', 'false');
            activeController = null;
        }
    }
});
