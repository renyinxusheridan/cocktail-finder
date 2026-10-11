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
const ingredientMatchingHint = document.querySelector('#ingredient-matching-hint');
const ingredientStatus = document.querySelector('#ingredient-status');
const ingredientLoadStatus = document.querySelector('#ingredient-load-status');
const ingredientRetry = document.querySelector('#ingredient-retry');
const ingredientVerifyRetry = document.querySelector('#ingredient-verify-retry');
const ingredientSuggestions = document.querySelector('#ingredient-suggestions');
const suggestionStatus = document.querySelector('#suggestion-status');
const ingredientNames = new Map();
const ingredientSearchCache = new Map();
let ingredientValidationVersion = 0;
let ingredientVerificationController;
let ingredientCommitPromise;
let ingredientCommitDraft;
let ingredientCommitKeepUnfinished;
let verificationSuggestionContext;
let previousIngredientInput = '';
let compositionDraft = '';
let ingredientLoadState = 'loading';
let ingredientLoadPromise;
let suggestedIngredients = [];
let activeSuggestion = -1;
let activeSuggestionDraft = '';
const unrecognizedIngredientMessage = 'We couldn’t find this ingredient in our list. Check the spelling or choose a suggestion.';
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
const searchPanels = [document.querySelector('#ingredient-search-panel'), document.querySelector('#name-search-panel')];
const accordionReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let accordionAnimations = [];
let accordionTransitionVersion = 0;
const heroEyebrow = document.querySelector('#hero-eyebrow');
const heroDescription = document.querySelector('#hero-description');
const searchLabel = document.querySelector('#search-label');
const searchHint = document.querySelector('#search-hint');
const ingredientControls = document.querySelector('#ingredient-controls');
const ingredientOutput = document.querySelector('#ingredient-output');
const nameOutput = document.querySelector('#name-search-output');
const inputDrafts = { ingredients: '', name: '' };
let searchMode = 'ingredients';

function setSearchMode(mode) {
    if (mode === searchMode) return;
    // Prevent the browser from following a moving accordion header as a scroll anchor.
    document.documentElement.classList.add('is-switching-search');
    const previousHeights = searchPanels.map(panel => panel.getBoundingClientRect().height);
    accordionTransitionVersion++;
    for (const animation of accordionAnimations) animation.cancel();
    accordionAnimations = [];
    invalidateIngredientValidation();
    closeSuggestions();
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
    previousIngredientInput = input.value;
    input.removeAttribute('aria-invalid');
    input.placeholder = byIngredients ? 'Try Gin, Lime, or Vodka' : 'Enter a cocktail name, e.g. Margarita';
    input.setAttribute('aria-describedby', byIngredients ? 'search-hint ingredient-load-status ingredient-matching-hint ingredient-status' : 'search-hint');
    for (const [attribute, value] of Object.entries({ role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'ingredient-suggestions', 'aria-expanded': 'false' })) {
        if (byIngredients) input.setAttribute(attribute, value);
        else input.removeAttribute(attribute);
    }
    searchLabel.textContent = byIngredients ? 'Your ingredients' : 'Cocktail name';
    searchHint.textContent = byIngredients
        ? 'Choose a suggestion, or press Enter or type a comma to add an ingredient. Use ↑/↓ to browse suggestions.'
        : 'Enter a cocktail name to find its recipe. Try Margarita or Mojito.';
    heroEyebrow.textContent = byIngredients ? 'DISCOVER WHAT YOU CAN MAKE' : 'FIND A FAVORITE COCKTAIL';
    heroDescription.textContent = byIngredients
        ? 'Turn the ingredients you already have into your next drink.'
        : 'Find a cocktail by name and explore its recipe.';
    findCocktails.textContent = byIngredients ? 'Find Cocktails' : 'Search Cocktails';
    findCocktails.disabled = false;
    for (const [button, expanded] of [[ingredientModeButton, byIngredients], [nameModeButton, !byIngredients]]) {
        button.setAttribute('aria-expanded', String(expanded));
        // The open header remains focusable, but cannot close the only open section.
        button.setAttribute('aria-disabled', String(expanded));
        button.closest('.search-mode-section').classList.toggle('is-expanded', expanded);
    }
    ingredientControls.hidden = !byIngredients;
    ingredientOutput.hidden = !byIngredients;
    nameOutput.hidden = byIngredients;
    resultNavigation.refresh(mode);
    showSearchPanel(byIngredients ? 0 : 1, previousHeights);
}

function showSearchPanel(activeIndex, previousHeights) {
    const version = accordionTransitionVersion;
    for (const [index, panel] of searchPanels.entries()) {
        panel.hidden = false;
        panel.inert = index !== activeIndex;
        panel.setAttribute('aria-hidden', String(index !== activeIndex));
        panel.classList.remove('is-animating');
    }
    // Reparent the same form: input, chip nodes, and all event handlers survive.
    searchPanels[activeIndex].append(form);
    const targetHeight = searchPanels[activeIndex].getBoundingClientRect().height;
    function finish() {
        if (version !== accordionTransitionVersion) return;
        accordionAnimations = [];
        for (const [index, panel] of searchPanels.entries()) {
            panel.classList.remove('is-animating');
            panel.hidden = index !== activeIndex;
        }
        updateSuggestions();
        // Settle the natural height before restoring ordinary page scroll anchoring.
        searchPanels[activeIndex].getBoundingClientRect();
        document.documentElement.classList.remove('is-switching-search');
    }
    if (accordionReducedMotion.matches) {
        finish();
        return;
    }
    accordionAnimations = searchPanels.map((panel, index) => {
        panel.classList.add('is-animating');
        return panel.animate([
            { height: `${previousHeights[index]}px`, opacity: index === activeIndex ? 0 : 1 },
            { height: `${index === activeIndex ? targetHeight : 0}px`, opacity: index === activeIndex ? 1 : 0 }
        ], { duration: 240, easing: 'ease-in-out' });
    });
    Promise.all(accordionAnimations.map(animation => animation.finished)).then(finish, () => {});
}

ingredientModeButton.addEventListener('click', () => setSearchMode('ingredients'));
nameModeButton.addEventListener('click', () => setSearchMode('name'));

async function loadIngredientNames() {
    // One successful list per page; concurrent calls share the same request.
    if (ingredientLoadState === 'ready') return;
    if (ingredientLoadPromise) return ingredientLoadPromise;
    ingredientLoadState = 'loading';
    ingredientLoadStatus.dataset.state = 'loading';
    ingredientLoadStatus.textContent = 'Loading ingredient list… You can type while we load it.';
    ingredientRetry.hidden = true;
    ingredientSuggestions.setAttribute('aria-busy', 'true');
    ingredientLoadPromise = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch('/api/cocktails?ingredients=list', { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data?.drinks) || !data.drinks.length ||
                data.drinks.some(item => typeof item?.strIngredient1 !== 'string' || !item.strIngredient1.trim())) {
                throw new Error('Unexpected ingredient data');
            }
            indexIngredientNames(data.drinks.map(item => item.strIngredient1));
            ingredientLoadState = 'ready';
            ingredientLoadStatus.dataset.state = '';
            ingredientLoadStatus.textContent = 'Ingredient suggestions ready. Other names are checked when you add them.';
            updateSuggestions();
        } catch (error) {
            ingredientLoadState = 'error';
            ingredientLoadStatus.dataset.state = 'error';
            ingredientLoadStatus.textContent = 'Unable to load the ingredient list. Retry for more suggestions; you can still enter names to check them.';
            ingredientRetry.hidden = false;
            closeSuggestions();
        } finally {
            clearTimeout(timeout);
            ingredientSuggestions.setAttribute('aria-busy', 'false');
            ingredientLoadPromise = null;
        }
    })();
    return ingredientLoadPromise;
}

ingredientRetry.addEventListener('click', () => {
    input.focus();
    loadIngredientNames();
});

ingredientVerifyRetry.addEventListener('click', () => {
    input.focus();
    commitIngredients(ingredientCommitKeepUnfinished);
});

function indexIngredientNames(names) {
    for (const name of names) {
        const key = ingredientKey(name);
        if (key && !ingredientNames.has(key)) ingredientNames.set(key, name);
    }
}

function indexRecipeIngredients(drinks) {
    for (const drink of drinks) {
        if (!drink || typeof drink !== 'object') continue;
        for (let i = 1; i <= 15; i++) {
            const name = drink[`strIngredient${i}`];
            if (typeof name === 'string') indexIngredientNames([name]);
        }
    }
    updateSuggestions();
}

function invalidateIngredientValidation() {
    ingredientValidationVersion++;
    ingredientVerificationController?.abort();
    ingredientVerificationController = null;
    ingredientCommitPromise = null;
    verificationSuggestionContext = null;
    ingredientVerifyRetry.hidden = true;
    ingredientStatus.dataset.state = '';
    ingredientStatus.textContent = '';
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-busy');
}

async function verifyIngredient(value, signal) {
    const key = ingredientKey(value);
    if (ingredientNames.has(key)) return { state: 'recognized' };
    try {
        let names = ingredientSearchCache.get(key);
        if (!names) {
            const url = new URL('/api/cocktails', window.location.origin);
            url.searchParams.set('ingredient', value.trim());
            const response = await fetch(url, { signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data || (data.ingredients !== null && !Array.isArray(data.ingredients)) ||
                (Array.isArray(data.ingredients) && data.ingredients.some(item =>
                    typeof item?.strIngredient !== 'string' || !item.strIngredient.trim()))) {
                throw new Error('Unexpected ingredient search data');
            }
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            names = [...new Map((data.ingredients || []).map(item =>
                [ingredientKey(item.strIngredient), item.strIngredient])).values()];
            ingredientSearchCache.set(key, names);
            // Cache all returned names as choices, but never substitute one for the input.
            indexIngredientNames(names);
        }
        return names.some(name => ingredientKey(name) === key)
            ? { state: 'recognized' }
            : { state: names.length ? 'choices' : 'invalid', names };
    } catch (error) {
        // Do not cache failures or turn a network/format failure into a spelling error.
        return { state: 'request-error' };
    }
}

function closeSuggestions() {
    ingredientSuggestions.hidden = true;
    ingredientSuggestions.replaceChildren();
    suggestedIngredients = [];
    activeSuggestion = -1;
    activeSuggestionDraft = '';
    if (searchMode === 'ingredients') input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    suggestionStatus.textContent = '';
}

function updateSuggestions() {
    closeSuggestions();
    if (searchMode !== 'ingredients' || accordionAnimations.length || document.activeElement !== input) return;
    const query = ingredientKey(input.value.split(',').pop());
    const choices = verificationSuggestionContext?.draft === input.value ? verificationSuggestionContext : null;
    if (!query && !choices) return;
    suggestedIngredients = choices ? choices.names.filter(name => !addedIngredients.has(ingredientKey(name))).slice(0, 6) : [...ingredientNames.entries()]
        .filter(([key]) => key.includes(query) && !addedIngredients.has(key))
        .sort(([a], [b]) => Number(b.startsWith(query)) - Number(a.startsWith(query)) || a.localeCompare(b))
        .slice(0, 6)
        .map(([, name]) => name);
    if (!suggestedIngredients.length) return;
    suggestedIngredients.forEach((name, index) => {
        const option = makeElement('li', name);
        option.id = `ingredient-suggestion-${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        // Keep focus on the combobox when clicking an option.
        option.addEventListener('pointerdown', event => event.preventDefault());
        option.addEventListener('click', () => selectSuggestion(name));
        ingredientSuggestions.append(option);
    });
    ingredientSuggestions.hidden = false;
    // Keep the popup above the collapsed name header so that header stays reachable.
    const availableHeight = nameModeButton.getBoundingClientRect().top - input.getBoundingClientRect().bottom - 12;
    ingredientSuggestions.style.maxHeight = `${Math.max(44, Math.min(272, availableHeight))}px`;
    input.setAttribute('aria-expanded', 'true');
    suggestionStatus.textContent = `${suggestedIngredients.length} suggestions available. Use Up and Down arrows to browse, then Enter to select.`;
}

function activateSuggestion(index) {
    activeSuggestion = index;
    activeSuggestionDraft = input.value;
    [...ingredientSuggestions.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    input.setAttribute('aria-activedescendant', ingredientSuggestions.children[index].id);
    ingredientSuggestions.children[index].scrollIntoView({ block: 'nearest' });
}

function selectSuggestion(name) {
    const parts = input.value.split(',');
    const index = verificationSuggestionContext?.draft === input.value ? verificationSuggestionContext.index : parts.length - 1;
    parts[index] = name;
    input.value = parts.join(',');
    previousIngredientInput = input.value;
    commitIngredients();
    input.focus();
}

function addIngredient(value) {
    const key = ingredientKey(value);
    const ingredient = ingredientNames.get(key);
    if (!ingredient) return 'invalid';
    if (addedIngredients.has(key)) return 'duplicate';
    addedIngredients.add(key);
    resetComparison();
    const chip = makeElement('li', '', 'ingredient-chip');
    const removeButton = makeElement('button', '×', 'ingredient-remove');
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `Remove ${ingredient}`);
    removeButton.addEventListener('click', () => {
        invalidateIngredientValidation();
        addedIngredients.delete(key);
        updateIngredientMatchingHint();
        resetComparison();
        chip.remove();
        ingredientStatus.dataset.state = '';
        ingredientStatus.textContent = `${ingredient} removed.`;
        input.removeAttribute('aria-invalid');
        input.focus();
        updateSuggestions();
    });
    chip.append(makeElement('span', ingredient), removeButton);
    ingredientList.append(chip);
    updateIngredientMatchingHint();
    return 'added';
}

function updateIngredientMatchingHint() {
    ingredientMatchingHint.hidden = ![...addedIngredients].some(ingredient =>
        normalizeIngredient(ingredient) === 'absolut vodka');
}

function commitIngredients(keepUnfinished = false) {
    const draft = input.value;
    if (ingredientCommitPromise && ingredientCommitDraft === draft && ingredientCommitKeepUnfinished === keepUnfinished) {
        return ingredientCommitPromise;
    }
    invalidateIngredientValidation();
    const version = ingredientValidationVersion;
    ingredientCommitDraft = draft;
    ingredientCommitKeepUnfinished = keepUnfinished;
    const parts = draft.split(',');
    const unfinished = keepUnfinished ? parts.pop() : '';
    const entries = parts.filter(part => part.trim()).map(part => ({ value: part.trim() }));
    const controller = new AbortController();
    ingredientVerificationController = controller;
    const needsVerification = entries.some(entry => !ingredientNames.has(ingredientKey(entry.value)));
    if (needsVerification) {
        ingredientStatus.dataset.state = 'loading';
        ingredientStatus.textContent = 'Checking ingredient names…';
        input.setAttribute('aria-busy', 'true');
        closeSuggestions();
    }
    const timeout = setTimeout(() => controller.abort(), 15000);
    ingredientCommitPromise = Promise.resolve().then(async () => {
        // Verify a repeated token once, and verify only on an add attempt, never per keystroke.
        const checks = new Map();
        for (const entry of entries) {
            const key = ingredientKey(entry.value);
            if (!checks.has(key)) checks.set(key, verifyIngredient(entry.value, controller.signal));
        }
        const outcomes = await Promise.all(entries.map(entry => checks.get(ingredientKey(entry.value))));
        if (version !== ingredientValidationVersion || searchMode !== 'ingredients' || input.value !== draft) return false;

        const added = [];
        const failures = [];
        let duplicates = 0;
        entries.forEach((entry, index) => {
            const outcome = outcomes[index];
            if (outcome.state !== 'recognized') {
                failures.push({ ...entry, ...outcome });
                return;
            }
            if (addIngredient(entry.value) === 'added') added.push(ingredientNames.get(ingredientKey(entry.value)));
            else duplicates++;
        });
        input.value = [...failures.map(entry => entry.value), ...(keepUnfinished ? [unfinished] : [])].join(',');
        previousIngredientInput = input.value;
        input.removeAttribute('aria-invalid');
        ingredientStatus.dataset.state = '';
        const requestFailed = failures.some(entry => entry.state === 'request-error');
        const choiceIndex = failures.findIndex(entry => entry.state === 'choices');
        if (choiceIndex >= 0) {
            verificationSuggestionContext = {
                draft: input.value, index: choiceIndex, names: failures[choiceIndex].names
            };
        }
        if (requestFailed) {
            ingredientStatus.dataset.state = 'error';
            ingredientStatus.textContent = 'We couldn’t verify this ingredient. Check your connection and retry the ingredient check.';
            ingredientVerifyRetry.hidden = false;
        } else if (failures.length) {
            ingredientStatus.dataset.state = choiceIndex >= 0 ? 'notice' : 'error';
            ingredientStatus.textContent = choiceIndex >= 0
                ? `No exact match for “${failures[choiceIndex].value}”. Choose a suggestion or edit your entry.`
                : unrecognizedIngredientMessage;
            input.setAttribute('aria-invalid', 'true');
        } else if (added.length) {
            ingredientStatus.textContent = `Added: ${added.join(', ')}.${duplicates ? ' Already selected ingredients were skipped.' : ''}`;
        } else if (duplicates) {
            ingredientStatus.dataset.state = 'notice';
            ingredientStatus.textContent = 'Those ingredients are already selected.';
        } else if (!keepUnfinished) {
            ingredientStatus.textContent = 'Please enter an ingredient.';
            ingredientStatus.dataset.state = 'error';
            input.setAttribute('aria-invalid', 'true');
        }
        updateSuggestions();
        return failures.length === 0;
    }).finally(() => {
        clearTimeout(timeout);
        if (version === ingredientValidationVersion) {
            ingredientVerificationController = null;
            ingredientCommitPromise = null;
            input.removeAttribute('aria-busy');
        }
    });
    return ingredientCommitPromise;
}

input.addEventListener('keydown', (event) => {
    if (event.isComposing || searchMode !== 'ingredients') return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeSuggestions();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (ingredientSuggestions.hidden) updateSuggestions();
        if (!suggestedIngredients.length) return;
        const next = activeSuggestion === -1
            ? (event.key === 'ArrowDown' ? 0 : suggestedIngredients.length - 1)
            : (activeSuggestion + (event.key === 'ArrowDown' ? 1 : -1) + suggestedIngredients.length) % suggestedIngredients.length;
        activateSuggestion(next);
    } else if (event.key === 'Enter' && activeSuggestion >= 0 &&
        activeSuggestionDraft === input.value && !ingredientSuggestions.hidden) {
        event.preventDefault();
        selectSuggestion(suggestedIngredients[activeSuggestion]);
    } else if (event.key === 'Enter' && input.value.trim()) {
        event.preventDefault();
        // Plain Enter validates the typed name; local suggestions are not a whitelist.
        commitIngredients();
    }
});
input.addEventListener('input', (event) => {
    resultNavigation.cancelPending();
    const previous = previousIngredientInput;
    previousIngredientInput = input.value;
    invalidateIngredientValidation();
    if (searchMode !== 'ingredients') return;
    // A retained invalid token may contain commas. Editing its unfinished tail
    // must not revalidate that older token and immediately restore its error.
    const newComma = event.data?.includes(',') || input.value.split(',').length > previous.split(',').length;
    if (!event.isComposing && newComma) commitIngredients(true);
    if (!event.isComposing) updateSuggestions();
});
input.addEventListener('compositionstart', () => { compositionDraft = input.value; });
input.addEventListener('compositionend', () => {
    invalidateIngredientValidation();
    if (searchMode === 'ingredients' && input.value.split(',').length > compositionDraft.split(',').length) {
        commitIngredients(true);
    }
    previousIngredientInput = input.value;
    updateSuggestions();
});
input.addEventListener('focus', updateSuggestions);
input.addEventListener('blur', closeSuggestions);

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (searchMode === 'ingredients') {
        const pendingCommit = input.value.trim() ? commitIngredients() : null;
        const version = ingredientValidationVersion;
        const committed = pendingCommit ? await pendingCommit : true;
        if (version !== ingredientValidationVersion || searchMode !== 'ingredients') return;
        if (!committed) {
            input.focus();
            updateSuggestions();
            return;
        }
        closeSuggestions();
        await findByIngredients();
    } else {
        await searchByName();
    }
});

loadIngredientNames();

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeIngredient(value) {
    return cleanText(value).replace(/\s+/g, ' ').toLowerCase();
}

function ingredientKey(value) {
    // Recognition is exact except for case and surrounding whitespace.
    // Keep internal spacing and words intact; brands and juices are distinct names.
    return cleanText(value).toLowerCase();
}

function matchesRecipeIngredient(requirement, selectedIngredients) {
    // Comparison only: this explicit brand-to-generic rule never changes validation.
    return selectedIngredients.has(requirement) ||
        (requirement === 'vodka' && selectedIngredients.has('absolut vodka'));
}

function compareRecipeIngredients(drink, selectedIngredients) {
    const recipeIngredients = new Set();
    for (let i = 1; i <= 15; i++) {
        const ingredient = normalizeIngredient(drink[`strIngredient${i}`]);
        if (ingredient) recipeIngredients.add(ingredient);
    }
    const matchedIngredients = [...recipeIngredients].filter(ingredient => matchesRecipeIngredient(ingredient, selectedIngredients));
    const missingIngredients = [...recipeIngredients].filter(ingredient => !matchesRecipeIngredient(ingredient, selectedIngredients));
    return {
        ...drink,
        matchedIngredients,
        matchedCount: matchedIngredients.length,
        missingIngredients,
        missingCount: missingIngredients.length
    };
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
    if (!comparisons.length) {
        comparisonResults.replaceChildren();
        buyNextResults.replaceChildren();
        comparisonSection.hidden = true;
        return;
    }
    const groups = [
        { title: 'Can Make Now', caption: 'Ready to Pour', drinks: [] },
        { title: 'One Ingredient Away', caption: 'Almost There', drinks: [] },
        { title: 'Two Ingredients Away', caption: 'A Few Additions', drinks: [] },
        { title: 'More Ingredients Away', caption: 'Keep Exploring', drinks: [] }
    ];
    // Input is already sorted; appending preserves that order within each group.
    for (const drink of comparisons) {
        groups[Math.min(drink.missingCount, 3)].drinks.push(drink);
    }
    const closestGroupIndex = groups.findIndex((group, index) => index > 0 && group.drinks.length > 0);

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
        } else if (index === 0 && closestGroupIndex > 0) {
            const closestButton = makeElement('button', 'View closest matches', 'closest-matches-button');
            closestButton.type = 'button';
            closestButton.addEventListener('click', () => {
                resultNavigation.navigateToSection(document.querySelector(`#comparison-group-${closestGroupIndex}`));
            });
            section.append(
                makeElement('p', 'You can’t make any of these cocktails yet.', 'comparison-empty-message'),
                makeElement('p', 'Check the closest matches to see what’s missing, or add more ingredients you have.', 'hint'),
                closestButton
            );
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
    const selectedIngredients = new Set([...addedIngredients].map(normalizeIngredient));
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
        indexRecipeIngredients(drinks);
        // Keep all retrieved recipes intact; relevance applies only to recommendations.
        const comparisons = drinks
            .map(drink => compareRecipeIngredients(drink, selectedIngredients))
            .filter(drink => drink.matchedCount > 0)
            .sort((a, b) => a.missingCount - b.missingCount ||
                b.matchedCount - a.matchedCount ||
                cleanText(a.strDrink).localeCompare(cleanText(b.strDrink)));
        renderComparisonGroups(comparisons);
        setComparisonStatus(comparisons.length
            ? `${comparisons.length} ${comparisons.length === 1 ? 'cocktail' : 'cocktails'} using your ingredients, sorted by missing ingredients.`
            : 'None of the recipes currently searched use your selected ingredients. Try adding another ingredient.');
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
        indexRecipeIngredients(drinks);
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
