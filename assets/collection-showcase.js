/**
 * Collection Showcase
 *
 * Manages tab navigation, slide switching, and auto-rotation.
 *
 * Autoplay uses setTimeout (not setInterval) so we can track elapsed time
 * and pause/resume the progress bar in place rather than resetting it.
 *
 * Pause sources:
 *   - Hover  → pauses, resumes on mouse-leave (unless user clicked a tab)
 *   - Tab / dropdown click → pauses and locks; resumes after 10 s of
 *     inactivity OR when the user clicks outside the component
 */

class CollectionShowcase extends HTMLElement {
  constructor() {
    super();

    /** @type {number} Auto-rotate duration in milliseconds */
    this.autoplaySpeed = (parseInt(this.dataset.autoplay ?? '5', 10) || 5) * 1000;

    /** @type {number} Currently active slide index */
    this.currentIndex = 0;

    /** @type {HTMLElement[]} */
    this.slides = [];

    /** @type {HTMLElement[]} Desktop tab buttons */
    this.tabs = [];

    /** @type {HTMLSelectElement|null} */
    this.dropdown = null;

    /** @type {HTMLElement|null} */
    this.mobileProgressFill = null;

    // ── Timer state ─────────────────────────────────────────────────────────

    /** @type {number|null} setTimeout handle for the next slide advance */
    this._slideTimer = null;

    /** @type {number|null} setTimeout handle for auto-resume after user click */
    this._resumeTimer = null;

    /** @type {number} Timestamp when the current slide timer was last started/resumed */
    this._slideStartTime = 0;

    /** @type {number} Milliseconds already elapsed when paused */
    this._elapsed = 0;

    /** @type {boolean} Whether the slide timer is currently paused */
    this._paused = false;

    /** @type {boolean} Whether the user has manually clicked a tab/dropdown */
    this._userInteracted = false;

    /** @type {((e: MouseEvent) => void)|null} Bound document click handler */
    this._onDocumentClick = null;
  }

  connectedCallback() {
    this.slides = Array.from(this.querySelectorAll('.collection-showcase__slide'));
    this.tabs   = Array.from(this.querySelectorAll('.collection-showcase__tab'));
    this.dropdown          = this.querySelector('.collection-showcase__dropdown');
    this.mobileProgressFill = this.querySelector('.collection-showcase__mobile-progress-fill');

    if (this.slides.length === 0) return;

    this._bindEvents();
    this._startSlideTimer();
  }

  disconnectedCallback() {
    clearTimeout(this._slideTimer ?? undefined);
    clearTimeout(this._resumeTimer ?? undefined);
    if (this._onDocumentClick) {
      document.removeEventListener('click', this._onDocumentClick);
    }
  }

  // ── Events ───────────────────────────────────────────────────────────────

  _bindEvents() {
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this._goTo(parseInt(tab.dataset.index ?? '0', 10), true);
      });
    });

    if (this.dropdown) {
      this.dropdown.addEventListener('change', () => {
        this._goTo(parseInt(/** @type {HTMLSelectElement} */ (this.dropdown).value, 10), true);
      });
    }

    // Hover → pause in place; leave → resume (unless locked by a click)
    this.addEventListener('mouseenter', () => this._pause());
    this.addEventListener('mouseleave', () => {
      if (!this._userInteracted) this._resume();
    });

    // Click outside → unlock and resume
    this._onDocumentClick = (/** @type {MouseEvent} */ e) => {
      if (this.contains(/** @type {Node} */ (e.target))) return;
      this._userInteracted = false;
      clearTimeout(this._resumeTimer ?? undefined);
      this._resumeTimer = null;
      if (!this.matches(':hover')) this._resume();
    };
    document.addEventListener('click', this._onDocumentClick);
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  /**
   * @param {number}  index
   * @param {boolean} [userTriggered=false]
   */
  _goTo(index, userTriggered = false) {
    const total = this.slides.length;
    if (total === 0) return;

    index = ((index % total) + total) % total;

    this.slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));

    this.tabs.forEach((tab, i) => {
      tab.classList.toggle('is-active', i === index);
      tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });

    if (this.dropdown) this.dropdown.value = String(index);

    this.currentIndex = index;

    if (userTriggered) {
      this._userInteracted = true;

      // Stop any running timer and reset progress to 0 for the new slide, then
      // hold it paused — the bar will start filling again on resume.
      clearTimeout(this._slideTimer ?? undefined);
      clearTimeout(this._resumeTimer ?? undefined);
      this._slideTimer  = null;
      this._resumeTimer = null;
      this._paused      = true;
      this._elapsed     = 0;
      this._slideStartTime = 0;
      this._resetProgressToZero();

      // Auto-resume after 10 s of no further interaction
      this._resumeTimer = setTimeout(() => {
        this._userInteracted = false;
        if (!this.matches(':hover')) this._resume();
      }, 10000);
    }
  }

  // ── Autoplay lifecycle ───────────────────────────────────────────────────

  /** Start a fresh slide timer (for the current slide) from 0. */
  _startSlideTimer() {
    if (this.slides.length <= 1) return;
    clearTimeout(this._slideTimer ?? undefined);
    this._slideStartTime = Date.now();
    this._elapsed        = 0;
    this._paused         = false;
    this._startProgressAnimation();
    this._slideTimer = setTimeout(() => {
      const next = (this.currentIndex + 1) % this.slides.length;
      this._goTo(next);
      this._startSlideTimer();
    }, this.autoplaySpeed);
  }

  /** Pause: freeze the progress bar and save how far through we are. */
  _pause() {
    if (this._paused || this.slides.length <= 1) return;
    this._paused  = true;
    this._elapsed = Date.now() - this._slideStartTime;
    clearTimeout(this._slideTimer ?? undefined);
    this._slideTimer = null;
    this._setProgressPlayState('paused');
  }

  /** Resume: continue the progress bar from where it was paused. */
  _resume() {
    if (!this._paused || this.slides.length <= 1) return;
    this._paused = false;
    const remaining = Math.max(0, this.autoplaySpeed - this._elapsed);
    this._slideStartTime = Date.now() - this._elapsed;
    this._setProgressPlayState('running');
    this._slideTimer = setTimeout(() => {
      const next = (this.currentIndex + 1) % this.slides.length;
      this._goTo(next);
      this._startSlideTimer();
    }, remaining);
  }

  // ── Progress animation helpers ───────────────────────────────────────────

  /** Restart the fill animation from 0 on all fills. */
  _startProgressAnimation() {
    this.tabs.forEach((tab) => {
      const fill = /** @type {HTMLElement|null} */ (tab.querySelector('.collection-showcase__tab-bar-fill'));
      if (!fill) return;
      fill.style.animation          = 'none';
      fill.style.animationPlayState = '';
      void fill.offsetWidth;
      fill.style.animation = '';
    });

    if (this.mobileProgressFill) {
      this.mobileProgressFill.classList.remove('is-playing');
      this.mobileProgressFill.style.animationPlayState = '';
      void this.mobileProgressFill.offsetWidth;
      this.mobileProgressFill.classList.add('is-playing');
      this.mobileProgressFill.style.animationPlayState = 'running';
    }
  }

  /** Reset all progress fills back to 0 (used when the user manually picks a slide). */
  _resetProgressToZero() {
    this.tabs.forEach((tab) => {
      const fill = /** @type {HTMLElement|null} */ (tab.querySelector('.collection-showcase__tab-bar-fill'));
      if (!fill) return;
      fill.style.animation          = 'none';
      fill.style.animationPlayState = '';
    });

    if (this.mobileProgressFill) {
      this.mobileProgressFill.classList.remove('is-playing');
      this.mobileProgressFill.style.animationPlayState = '';
    }
  }

  /**
   * Set `animation-play-state` on all fill elements.
   * @param {'running'|'paused'} state
   */
  _setProgressPlayState(state) {
    this.tabs.forEach((tab) => {
      const fill = /** @type {HTMLElement|null} */ (tab.querySelector('.collection-showcase__tab-bar-fill'));
      if (fill) fill.style.animationPlayState = state;
    });
    if (this.mobileProgressFill) {
      this.mobileProgressFill.style.animationPlayState = state;
    }
  }
}

if (!customElements.get('collection-showcase')) {
  customElements.define('collection-showcase', CollectionShowcase);
}
