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

const ingredientForm = document.querySelector('#ingredient-form');
const ingredientInput = document.querySelector('#ingredient-name');
const ingredientList = document.querySelector('#ingredient-list');
const ingredientStatus = document.querySelector('#ingredient-status');
const addedIngredients = new Set();
const findCocktails = document.querySelector('#find-cocktails');
const comparisonStatus = document.querySelector('#comparison-status');
const comparisonSection = document.querySelector('#comparison-section');
const comparisonResults = document.querySelector('#comparison-results');
let comparisonController;
let latestComparisonRequest = 0;

ingredientForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const ingredient = ingredientInput.value.trim().replace(/\s+/g, ' ');
    const key = normalizeIngredient(ingredient);

    if (!ingredient || addedIngredients.has(key)) {
        ingredientInput.setAttribute('aria-invalid', 'true');
        ingredientStatus.dataset.state = 'error';
        ingredientStatus.textContent = !ingredient
            ? 'Please enter an ingredient.'
            : `${ingredient} is already added.`;
        ingredientInput.focus();
        return;
    }

    addedIngredients.add(key);
    resetComparison();
    const chip = makeElement('li', '', 'ingredient-chip');
    const removeButton = makeElement('button', '×', 'ingredient-remove');
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `Remove ${ingredient}`);
    removeButton.addEventListener('click', () => {
        addedIngredients.delete(key);
        resetComparison();
        chip.remove();
        ingredientStatus.dataset.state = '';
        ingredientStatus.textContent = `${ingredient} removed.`;
        ingredientInput.removeAttribute('aria-invalid');
        ingredientInput.focus();
    });
    chip.append(makeElement('span', ingredient), removeButton);
    ingredientList.append(chip);
    ingredientInput.value = '';
    ingredientInput.removeAttribute('aria-invalid');
    ingredientStatus.dataset.state = '';
    ingredientStatus.textContent = `${ingredient} added.`;
    ingredientInput.focus();
});

ingredientInput.addEventListener('input', () => {
    ingredientInput.removeAttribute('aria-invalid');
    ingredientStatus.dataset.state = '';
    ingredientStatus.textContent = '';
});

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeIngredient(value) {
    return cleanText(value).replace(/\s+/g, ' ').toLowerCase();
}

function compareRecipeIngredients(drink, selectedIngredients) {
    const recipeIngredients = new Set();
    for (let i = 1; i <= 15; i++) {
        const ingredient = normalizeIngredient(drink[`strIngredient${i}`]);
        if (ingredient) recipeIngredients.add(ingredient);
    }
    const missingIngredients = [...recipeIngredients].filter(ingredient => !selectedIngredients.has(ingredient));
    return { ...drink, missingIngredients, missingCount: missingIngredients.length };
}

function setComparisonStatus(message, state = '') {
    comparisonStatus.textContent = message;
    comparisonStatus.dataset.state = state;
}

function resetComparison() {
    // Ingredient changes invalidate both displayed results and any pending request.
    latestComparisonRequest++;
    if (comparisonController) comparisonController.abort();
    comparisonController = null;
    comparisonResults.replaceChildren();
    comparisonSection.setAttribute('aria-busy', 'false');
    findCocktails.disabled = false;
    setComparisonStatus('Ingredients changed. Select Find Cocktails to compare the S-name recipe sample.');
}

function createComparisonCard(drink) {
    const card = makeElement('article', '', 'comparison-card');
    const body = makeElement('div', '', 'recipe-body');
    body.append(
        makeElement('h5', cleanText(drink.strDrink) || 'Unnamed cocktail'),
        makeElement('p', `Missing ingredients: ${drink.missingCount}`)
    );
    if (drink.missingCount) {
        const missingList = makeElement('ul');
        for (const ingredient of drink.missingIngredients) {
            missingList.append(makeElement('li', ingredient));
        }
        body.append(missingList);
    } else {
        body.append(makeElement('p', 'No missing ingredients.'));
    }
    card.append(createDrinkImage(drink), body);
    return card;
}

function renderComparisonGroups(comparisons) {
    const groups = [
        { title: 'Can Make Now', drinks: [] },
        { title: 'One Ingredient Away', drinks: [] },
        { title: 'Two Ingredients Away', drinks: [] },
        { title: 'More Ingredients Needed', drinks: [] }
    ];
    // Input is already sorted; appending preserves that order within each group.
    for (const drink of comparisons) {
        groups[Math.min(drink.missingCount, 3)].drinks.push(drink);
    }

    const fragment = document.createDocumentFragment();
    groups.forEach((group, index) => {
        const section = makeElement('section', '', 'comparison-group');
        const count = group.drinks.length;
        const heading = makeElement('h4', `${group.title} — ${count} ${count === 1 ? 'cocktail' : 'cocktails'}`);
        heading.id = `comparison-group-${index}-heading`;
        section.setAttribute('aria-labelledby', heading.id);
        section.append(heading);
        if (count) {
            const grid = makeElement('div', '', 'results-grid');
            for (const drink of group.drinks) grid.append(createComparisonCard(drink));
            section.append(grid);
        } else {
            section.append(makeElement('p', 'No cocktails in this group.', 'hint'));
        }
        fragment.append(section);
    });
    comparisonResults.replaceChildren(fragment);
}

findCocktails.addEventListener('click', async () => {
    resetComparison();
    if (!addedIngredients.size) {
        setComparisonStatus('Add at least one ingredient before comparing the S-name recipe sample.', 'error');
        ingredientInput.focus();
        return;
    }

    const requestId = latestComparisonRequest;
    const selectedIngredients = new Set(addedIngredients);
    const controller = new AbortController();
    comparisonController = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    findCocktails.disabled = true;
    comparisonSection.setAttribute('aria-busy', 'true');
    setComparisonStatus('Loading the S-name recipe sample and comparing ingredients…', 'loading');

    try {
        // Always use our backend for this prototype, including local Vercel development.
        const response = await fetch('/api/cocktails?letter=s', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (requestId !== latestComparisonRequest) return;
        if (!data || (data.drinks !== null && !Array.isArray(data.drinks))) {
            throw new Error('Unexpected API response');
        }
        const drinks = data.drinks || [];
        if (!drinks.length) {
            renderComparisonGroups([]);
            setComparisonStatus('No recipes were returned for the S-name recipe sample. Please try again.');
            return;
        }
        if (drinks.some(drink => !drink || typeof drink !== 'object' || Array.isArray(drink))) {
            throw new Error('Unexpected recipe data');
        }
        const comparisons = drinks
            .map(drink => compareRecipeIngredients(drink, selectedIngredients))
            .sort((a, b) => a.missingCount - b.missingCount ||
                cleanText(a.strDrink).localeCompare(cleanText(b.strDrink)));
        renderComparisonGroups(comparisons);
        setComparisonStatus(`Compared ${comparisons.length} ${comparisons.length === 1 ? 'recipe' : 'recipes'} from the S-name recipe sample, sorted by fewest missing ingredients.`);
    } catch (error) {
        if (requestId !== latestComparisonRequest) return;
        setComparisonStatus(error.name === 'AbortError'
            ? 'The S-name recipe sample request timed out. Please try again.'
            : 'Unable to load the S-name recipe sample. Check your connection and make sure the /api/cocktails backend is running, then try again.', 'error');
    } finally {
        clearTimeout(timeout);
        if (requestId === latestComparisonRequest) {
            comparisonSection.setAttribute('aria-busy', 'false');
            findCocktails.disabled = false;
            comparisonController = null;
        }
    }
});


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
