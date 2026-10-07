// Presentation only: search functions notify this controller after rendering.
const resultNavigation = (() => {
    const area = document.querySelector('#results-area');
    const navigation = document.querySelector('#result-navigation');
    const links = document.querySelector('#result-navigation-links');
    const mobileTop = document.querySelector('#mobile-back-to-top');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let generation = 0;
    let sections = [];
    let inResults = false;
    let stopReturningToTop = () => {};
    const visibleSections = new Set();

    const behavior = () => reducedMotion.matches ? 'auto' : 'smooth';
    const isVisible = element => element && element.getClientRects().length > 0;

    function focusContent(element) {
        element.tabIndex = -1;
        element.classList.add('navigation-focus');
        element.addEventListener('blur', () => element.classList.remove('navigation-focus'), { once: true });
        element.focus({ preventScroll: true });
    }

    // Only the temporary destination suppresses its programmatic focus ring.
    // A subsequent keyboard action restores ordinary :focus-visible styling.
    document.addEventListener('keydown', () => {
        document.querySelector('.navigation-focus')?.classList.remove('navigation-focus');
    }, true);

    function cancelPending() {
        generation++;
        stopReturningToTop();
    }

    function updateVisibility() {
        const show = sections.length > 0 && inResults;
        navigation.hidden = !show;
        mobileTop.hidden = !show;
    }

    let areaObserver;
    let sectionObserver;
    let resizeTimer;

    function setCurrent(id) {
        for (const link of links.querySelectorAll('a')) {
            if (link.hash === `#${id}`) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
        }
    }

    function observeLayout() {
        areaObserver?.disconnect();
        sectionObserver?.disconnect();
        visibleSections.clear();
        // Pixel margins use viewport height, including on wide, short screens.
        const height = window.innerHeight;
        areaObserver = new IntersectionObserver(entries => {
            inResults = entries[0].isIntersecting;
            updateVisibility();
        }, { rootMargin: `-${height * .15}px 0px -${height * .7}px 0px`, threshold: 0 });
        areaObserver.observe(area);
        sectionObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) visibleSections.add(entry.target);
                else visibleSections.delete(entry.target);
            }
            // Keep the section nearest the top active when two share the viewport.
            const current = sections.find(section => visibleSections.has(section.element));
            if (current) setCurrent(current.element.id);
        }, { rootMargin: `-${height * .08}px 0px -${height * .6}px 0px`, threshold: 0 });
        for (const section of sections) sectionObserver.observe(section.element);
    }
    observeLayout();
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(observeLayout, 100);
    });

    function reset() {
        cancelPending();
        sectionObserver.disconnect();
        visibleSections.clear();
        sections = [];
        links.replaceChildren();
        area.classList.remove('has-results');
        updateVisibility();
    }

    function refresh(mode) {
        sectionObserver.disconnect();
        visibleSections.clear();
        sections = [];
        if (mode === 'ingredients' && isVisible(document.querySelector('#ingredient-output'))) {
            const buying = document.querySelector('#buy-next-section');
            if (buying?.querySelector('li')) sections.push({ element: buying, label: 'What to Buy Next' });
            for (const group of area.querySelectorAll('.comparison-group')) {
                if (isVisible(group) && group.querySelector('.comparison-card')) {
                    sections.push({ element: group, label: group.dataset.navigationLabel });
                }
            }
        } else if (mode === 'name') {
            const nameSection = document.querySelector('#results-section');
            if (isVisible(nameSection) && nameSection.querySelector('.recipe')) {
                sections.push({ element: nameSection, label: 'Search Results' });
            }
        }
        links.replaceChildren();
        for (const { element, label } of sections) {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = `#${element.id}`;
            link.textContent = label;
            link.addEventListener('click', event => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                cancelPending();
                const heading = element.querySelector('h2, h3');
                focusContent(heading);
                heading.scrollIntoView({ behavior: behavior(), block: 'start' });
            });
            item.append(link);
            links.append(item);
            sectionObserver.observe(element);
        }
        area.classList.toggle('has-results', sections.length > 0);
        if (sections.length) setCurrent(sections[0].element.id);
        updateVisibility();
    }

    function complete(mode) {
        cancelPending();
        const ticket = generation;
        // Two frames allow the inserted headings/cards and new layout to paint.
        // Lazy images already reserve their space through aspect-ratio in CSS.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (ticket !== generation || document.querySelector('#recipe-dialog').open) return;
            const output = document.querySelector(mode === 'ingredients' ? '#ingredient-output' : '#name-search-output');
            const summary = document.querySelector(mode === 'ingredients' ? '#comparison-status' : '#status');
            if (!isVisible(output) || !summary.textContent.trim() || summary.dataset.state === 'loading') return;
            refresh(mode);
            const hasCards = !!output.querySelector('.comparison-card, .recipe');
            const heading = hasCards ? output.querySelector('h2') : summary;
            if (!isVisible(heading)) return;
            focusContent(heading);
            summary.scrollIntoView({ behavior: behavior(), block: 'start' });
        }));
    }

    function returnToTop() {
        cancelPending();
        const hero = document.querySelector('#search-area');
        const input = document.querySelector('#search-input');
        if (reducedMotion.matches) {
            hero.scrollIntoView({ behavior: 'auto', block: 'start' });
            input.focus({ preventScroll: true });
            return;
        }
        let timer;
        function cleanup() {
            clearTimeout(timer);
            document.removeEventListener('scrollend', finish);
            document.removeEventListener('scroll', onScroll);
            window.removeEventListener('wheel', cleanup);
            window.removeEventListener('touchstart', cleanup);
            window.removeEventListener('pointerdown', cleanup);
            window.removeEventListener('keydown', cleanup);
            stopReturningToTop = () => {};
        }
        function finish() {
            cleanup();
            input.focus({ preventScroll: true });
        }
        // Debounced fallback for browsers without scrollend; no layout polling.
        function onScroll() {
            clearTimeout(timer);
            timer = setTimeout(finish, 180);
        }
        stopReturningToTop = cleanup;
        document.addEventListener('scrollend', finish, { once: true });
        document.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('wheel', cleanup, { passive: true });
        window.addEventListener('touchstart', cleanup, { passive: true });
        window.addEventListener('pointerdown', cleanup);
        window.addEventListener('keydown', cleanup);
        hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
        onScroll();
    }

    navigation.querySelector('.back-to-top').addEventListener('click', returnToTop);
    mobileTop.addEventListener('click', returnToTop);
    return { reset, refresh, complete, cancelPending };
})();
