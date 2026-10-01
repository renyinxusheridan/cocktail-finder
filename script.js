const form = document.querySelector('#search-form');
const input = document.querySelector('#cocktail-name');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const resultsSection = document.querySelector('#results-section');
const recipeDialog = document.querySelector('#recipe-dialog');
const recipeDetails = document.querySelector('#recipe-details');
const closeRecipe = document.querySelector('.dialog-close');
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

function createDrinkImage(drink) {
    const name = cleanText(drink.strDrink) || 'Unnamed cocktail';
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
        return image;
    }
    return fallback;
}

function createRecipe(drink) {
    const name = cleanText(drink.strDrink) || 'Unnamed cocktail';
    const card = makeElement('button', '', 'recipe');
    card.type = 'button';
    card.setAttribute('aria-haspopup', 'dialog');
    card.append(createDrinkImage(drink), makeElement('span', name, 'recipe-name'));
    card.addEventListener('click', () => openRecipe(drink));
    return card;
}

function openRecipe(drink) {
    const name = cleanText(drink.strDrink) || 'Unnamed cocktail';
    const body = makeElement('div', '', 'recipe-body');
    const title = makeElement('h2', name);
    title.id = 'recipe-title';
    const ingredients = makeElement('ul');
    
    for (let i = 1; i <= 15; i++) {
        const ingredient = cleanText(drink[`strIngredient${i}`]);
        const measure = cleanText(drink[`strMeasure${i}`]);
        if (ingredient) {
            ingredients.append(makeElement('li', measure ? `${measure} — ${ingredient}` : ingredient));
        }
    }
    body.append(title, makeElement('h3', 'Ingredients'));
    body.append(ingredients.children.length ? ingredients : makeElement('p', 'Ingredients unavailable.'));
    body.append(
        makeElement('h3', 'Instructions'),
        makeElement('p', cleanText(drink.strInstructions) || 'English instructions unavailable.', 'instructions')
    );
    recipeDetails.replaceChildren(createDrinkImage(drink), body);
    recipeDialog.showModal();
    document.body.classList.add('recipe-open');
}

closeRecipe.addEventListener('click', () => recipeDialog.close());
recipeDialog.addEventListener('close', () => {
    document.body.classList.remove('recipe-open');
});
recipeDialog.addEventListener('click', (event) => {
    const bounds = recipeDialog.getBoundingClientRect();
    if (event.target === recipeDialog &&
        (event.clientX < bounds.left || event.clientX > bounds.right ||
         event.clientY < bounds.top || event.clientY > bounds.bottom)) {
        recipeDialog.close();
    }
});

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
       
        // Static local previews cannot run the Vercel API function.
        const isLocalPreview = window.location.protocol === 'file:' ||
            ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
        const url = isLocalPreview
            ? new URL('https://www.thecocktaildb.com/api/json/v1/1/search.php')
            : new URL('/api/cocktails', window.location.origin);
        url.searchParams.set(isLocalPreview ? 's' : 'name', query);
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
