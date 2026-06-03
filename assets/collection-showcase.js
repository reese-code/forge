/**
 * Collection Showcase
 *
 * Manages tab navigation, slide switching, and auto-rotation
 * for the Collection Showcase section.
 *
 * Tabs are <button> elements — they switch the active slide only,
 * no page navigation. Clicking the image or the "Shop collection"
 * button navigates to the collection.
 */

class CollectionShowcase extends HTMLElement {
  constructor() {
    super();

    /** @type {number} Auto-rotate interval in milliseconds */
    this.autoplaySpeed = (parseInt(this.dataset.autoplay ?? '5', 10) || 5) * 1000;

    /** @type {number} Currently active slide index */
    this.currentIndex = 0;

    /** @type {HTMLElement[]} Slide elements */
    this.slides = [];

    /** @type {HTMLElement[]} Desktop tab button elements */
    this.tabs = [];

    /** @type {HTMLSelectElement|null} Mobile dropdown */
    this.dropdown = null;

    /** @type {number|null} setInterval handle */
    this.timer = null;

    /** @type {number|null} setTimeout handle for auto-resume */
    this._resumeTimer = null;

    /** @type {boolean} Whether the user has manually interacted */
    this.userInteracted = false;
  }

  connectedCallback() {
    this.slides = Array.from(this.querySelectorAll('.collection-showcase__slide'));
    this.tabs = Array.from(this.querySelectorAll('.collection-showcase__tab'));
    this.dropdown = this.querySelector('.collection-showcase__dropdown');

    if (this.slides.length === 0) return;

    this._bindEvents();
    this._startAutoplay();
  }

  disconnectedCallback() {
    this._stopAutoplay();
  }

  // ── Private Methods ──────────────────────────────────────────────────────

  _bindEvents() {
    // Tab click handlers — always just switch the slide, never navigate
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const index = parseInt(tab.dataset.index ?? '0', 10);
        this._goTo(index, true);
      });
    });

    // Mobile dropdown
    const dropdown = this.dropdown;
    if (dropdown) {
      dropdown.addEventListener('change', () => {
        this._goTo(parseInt(dropdown.value, 10), true);
      });
    }

    // Pause on hover / focus
    this.addEventListener('mouseenter', () => this._stopAutoplay());
    this.addEventListener('mouseleave', () => {
      if (!this.userInteracted) this._startAutoplay();
    });

    this.addEventListener('focusin', () => this._stopAutoplay());
    this.addEventListener('focusout', () => {
      if (!this.userInteracted && !this.matches(':hover')) this._startAutoplay();
    });
  }

  /**
   * Navigate to a specific slide index.
   * @param {number} index - Target slide index
   * @param {boolean} [userTriggered=false] - Whether user initiated the change
   */
  _goTo(index, userTriggered = false) {
    const total = this.slides.length;
    if (total === 0) return;

    // Normalise index (wrap around)
    index = ((index % total) + total) % total;

    // Update slides
    this.slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index);
    });

    // Update desktop tabs
    this.tabs.forEach((tab, i) => {
      const active = i === index;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    // Update mobile dropdown
    if (this.dropdown != null) {
      this.dropdown.value = String(index);
    }

    this.currentIndex = index;

    if (userTriggered) {
      this.userInteracted = true;
      this._stopAutoplay();
      // Resume auto-rotate after 10 seconds of inactivity
      this._resumeTimer = setTimeout(() => {
        this.userInteracted = false;
        this._startAutoplay();
      }, 10000);
    }
  }

  _startAutoplay() {
    if (this.slides.length <= 1) return;
    this._stopAutoplay();
    this.timer = setInterval(() => {
      const next = (this.currentIndex + 1) % this.slides.length;
      this._goTo(next);
    }, this.autoplaySpeed);
  }

  _stopAutoplay() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this._resumeTimer !== null) {
      clearTimeout(this._resumeTimer);
      this._resumeTimer = null;
    }
  }
}

if (!customElements.get('collection-showcase')) {
  customElements.define('collection-showcase', CollectionShowcase);
}
