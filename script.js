const form = document.querySelector('#search-form');
const input = document.querySelector('#search-input');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const resultsSection = document.querySelector('#results-section');
const recipeDialog = document.querySelector('#recipe-dialog');
const recipeDetails = document.querySelector('#recipe-details');
const closeRecipe = document.querySelector('.dialog-close');
let activeController;
let latestRequest = 0;

const ingredientInput = input;
const ingredientList = document.querySelector('#ingredient-list');
const ingredientStatus = document.querySelector('#ingredient-status');
const addedIngredients = new Set();
const findCocktails = document.querySelector('#search-submit');
const comparisonStatus = document.querySelector('#comparison-status');
const comparisonSection = document.querySelector('#comparison-section');
const comparisonResults = document.querySelector('#comparison-results');
const buyNextResults = document.querySelector('#buy-next-results');
let comparisonController;
let latestComparisonRequest = 0;

const ingredientModeButton = document.querySelector('#mode-ingredients');
const nameModeButton = document.querySelector('#mode-name');
const searchLabel = document.querySelector('#search-label');
const searchHint = document.querySelector('#search-hint');
const ingredientControls = document.querySelector('#ingredient-controls');
const ingredientOutput = document.querySelector('#ingredient-output');
const nameOutput = document.querySelector('#name-search-output');
const inputDrafts = { ingredients: '', name: '' };
let searchMode = 'ingredients';

function setSearchMode(mode) {
    if (mode === searchMode) return;
    resultNavigation.reset();
    inputDrafts[searchMode] = input.value;
    // Cancel pending work so an old response cannot update the shared controls.
    latestRequest++;
    latestComparisonRequest++;
    if (activeController) activeController.abort();
    if (comparisonController) comparisonController.abort();
    activeController = null;
    comparisonController = null;
    resultsSection.setAttribute('aria-busy', 'false');
    comparisonSection.setAttribute('aria-busy', 'false');
    if (status.dataset.state === 'loading') setStatus('Search paused. Search again when you are ready.');
    if (comparisonStatus.dataset.state === 'loading') {
        setComparisonStatus('Comparison paused. Select Find Cocktails to try again.');
    }
    searchMode = mode;
    const byIngredients = mode === 'ingredients';
    input.value = inputDrafts[mode];
    input.removeAttribute('aria-invalid');
    input.placeholder = byIngredients ? 'Enter ingredients, separated by commas' : 'Search for a cocktail';
    input.setAttribute('aria-describedby', byIngredients ? 'search-hint ingredient-status' : 'search-hint');
    searchLabel.textContent = byIngredients ? 'Your ingredients' : 'Cocktail name';
    searchHint.textContent = byIngredients
        ? 'Press Enter or type a comma to add ingredients.'
        : 'Try Margarita or Mojito.';
    findCocktails.textContent = byIngredients ? 'Find Cocktails' : 'Search';
    findCocktails.disabled = false;
    ingredientModeButton.setAttribute('aria-pressed', String(byIngredients));
    nameModeButton.setAttribute('aria-pressed', String(!byIngredients));
    ingredientControls.hidden = !byIngredients;
    ingredientOutput.hidden = !byIngredients;
    nameOutput.hidden = byIngredients;
    resultNavigation.refresh(mode);
}

ingredientModeButton.addEventListener('click', () => setSearchMode('ingredients'));
nameModeButton.addEventListener('click', () => setSearchMode('name'));

function addIngredient(value) {
    const ingredient = value.trim().replace(/\s+/g, ' ');
    const key = normalizeIngredient(ingredient);
    if (!key || addedIngredients.has(key)) return false;
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
        input.removeAttribute('aria-invalid');
        input.focus();
    });
    chip.append(makeElement('span', ingredient), removeButton);
    ingredientList.append(chip);
    return true;
}

function commitIngredients(keepUnfinished = false) {
    const parts = input.value.split(',');
    const unfinished = keepUnfinished ? parts.pop() : '';
    const added = [];
    let duplicates = 0;
    for (const part of parts) {
        if (!part.trim()) continue;
        if (addIngredient(part)) added.push(part.trim().replace(/\s+/g, ' '));
        else duplicates++;
    }
    input.value = unfinished;
    input.removeAttribute('aria-invalid');
    ingredientStatus.dataset.state = '';
    if (added.length) {
        ingredientStatus.textContent = `Added: ${added.join(', ')}.${duplicates ? ' Already selected ingredients were skipped.' : ''}`;
    } else if (duplicates) {
        ingredientStatus.dataset.state = 'notice';
        ingredientStatus.textContent = 'Those ingredients are already selected.';
    } else if (!keepUnfinished) {
        ingredientStatus.textContent = 'Please enter an ingredient.';
        ingredientStatus.dataset.state = 'error';
        input.setAttribute('aria-invalid', 'true');
    }
}

input.addEventListener('keydown', (event) => {
    if (event.isComposing || searchMode !== 'ingredients' || event.key !== 'Enter') return;
    if (input.value.trim()) {
        event.preventDefault();
        commitIngredients();
    }
});
input.addEventListener('input', (event) => {
    resultNavigation.cancelPending();
    input.removeAttribute('aria-invalid');
    if (searchMode !== 'ingredients') return;
    ingredientStatus.dataset.state = '';
    ingredientStatus.textContent = '';
    if (!event.isComposing && input.value.includes(',')) commitIngredients(true);
});
input.addEventListener('compositionend', () => {
    if (searchMode === 'ingredients' && input.value.includes(',')) commitIngredients(true);
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (searchMode === 'ingredients') {
        if (input.value.trim()) commitIngredients();
        await findByIngredients();
    } else {
        await searchByName();
    }
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
    buyNextResults.replaceChildren();
    comparisonSection.hidden = true;
    comparisonSection.setAttribute('aria-busy', 'false');
    findCocktails.disabled = false;
    setComparisonStatus('');
    resultNavigation.reset();
}

function createComparisonCard(drink) {
    const card = makeElement('article', '', 'comparison-card');
    const body = makeElement('div', '', 'recipe-body');
    const heading = makeElement('h4');
    const openButton = makeElement('button', '', 'comparison-open');
    openButton.append(makeElement('span', cleanText(drink.strDrink) || 'Unnamed cocktail', 'cocktail-title'));
    openButton.type = 'button';
    openButton.setAttribute('aria-haspopup', 'dialog');
    openButton.setAttribute('aria-controls', 'recipe-dialog');
    openButton.addEventListener('click', () => openRecipe(drink));
    heading.append(openButton);
    body.append(
        heading,
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

function createBuyingRecommendations(oneIngredientAway) {
    const unlockCounts = new Map();
    for (const drink of oneIngredientAway) {
        const ingredient = drink.missingIngredients[0];
        unlockCounts.set(ingredient, (unlockCounts.get(ingredient) || 0) + 1);
    }
    const recommendations = [...unlockCounts.entries()]
        .sort(([ingredientA, countA], [ingredientB, countB]) =>
            countB - countA || ingredientA.localeCompare(ingredientB))
        .slice(0, 3);

    const section = makeElement('section', '', 'buy-next');
    section.id = 'buy-next-section';
    const heading = makeElement('h2', 'What to Buy Next');
    heading.id = 'buy-next-heading';
    section.setAttribute('aria-labelledby', heading.id);
    section.append(
        heading,
        makeElement('p', 'Based only on the retrieved S-name recipe sample.', 'hint')
    );
    if (recommendations.length) {
        const list = makeElement('ul');
        for (const [ingredient, count] of recommendations) {
            const name = ingredient.charAt(0).toUpperCase() + ingredient.slice(1);
            list.append(makeElement('li', `${name} — unlocks ${count} ${count === 1 ? 'cocktail' : 'cocktails'}`));
        }
        section.append(list);
    } else {
        section.append(makeElement('p', 'No single ingredient can unlock another cocktail in the current S-name sample.', 'hint'));
    }
    return section;
}

function renderComparisonGroups(comparisons) {
    const groups = [
        { title: 'Can Make Now', caption: 'Ready to Pour', drinks: [] },
        { title: 'One Ingredient Away', caption: 'Almost There', drinks: [] },
        { title: 'Two Ingredients Away', caption: 'A Few Additions', drinks: [] },
        { title: 'More Ingredients Needed', caption: 'Keep Exploring', drinks: [] }
    ];
    // Input is already sorted; appending preserves that order within each group.
    for (const drink of comparisons) {
        groups[Math.min(drink.missingCount, 3)].drinks.push(drink);
    }

    const fragment = document.createDocumentFragment();
    groups.forEach((group, index) => {
        const section = makeElement('section', '', 'comparison-group');
        section.id = `comparison-group-${index}`;
        section.dataset.navigationLabel = group.title;
        const count = group.drinks.length;
        const heading = makeElement('h3', group.title);
        heading.append(makeElement('span', `${count} ${count === 1 ? 'cocktail' : 'cocktails'}`, 'group-count'));
        heading.id = `comparison-group-${index}-heading`;
        section.setAttribute('aria-labelledby', heading.id);
        section.append(heading, makeElement('p', group.caption, 'section-caption'));
        if (count) {
            const grid = makeElement('div', '', 'results-grid');
            for (const drink of group.drinks) grid.append(createComparisonCard(drink));
            section.append(grid);
        } else {
            section.append(makeElement('p', 'No cocktails in this group.', 'hint'));
        }
        fragment.append(section);
    });
    buyNextResults.replaceChildren(createBuyingRecommendations(groups[1].drinks));
    comparisonResults.replaceChildren(fragment);
    comparisonSection.hidden = false;
}

async function findByIngredients() {
    resetComparison();
    if (!addedIngredients.size) {
        setComparisonStatus('Add at least one ingredient before comparing the S-name recipe sample.', 'error');
        ingredientInput.focus();
        resultNavigation.complete('ingredients');
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
        setComparisonStatus(`${comparisons.length} ${comparisons.length === 1 ? 'cocktail' : 'cocktails'}, sorted by missing ingredients.`);
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
            resultNavigation.complete('ingredients');
        }
    }
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

async function searchByName() {
    resultNavigation.reset();
    const requestId = ++latestRequest;
    if (activeController) activeController.abort();
    activeController = null;
    findCocktails.disabled = false;
    results.replaceChildren();
    resultsSection.hidden = true;
    resultsSection.setAttribute('aria-busy', 'false');
    const query = input.value.trim();
    input.removeAttribute('aria-invalid');
    if (!query) {
        input.setAttribute('aria-invalid', 'true');
        setStatus('Please enter a cocktail name.', 'error');
        input.focus();
        resultNavigation.complete('name');
        return;
    }

    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    findCocktails.disabled = true;
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
        resultsSection.hidden = false;
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
            findCocktails.disabled = false;
            resultNavigation.complete('name');
        }
    }
}
