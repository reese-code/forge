/* FORGE SUPPLY — Skin Quiz */
(function () {
  'use strict';

  const cfg = window.__quizConfig || {};
  const STOREFRONT_TOKEN = cfg.storefrontToken || '';
  const SHOP_DOMAIN = cfg.shopDomain || '';
  const MAX_RESULTS = cfg.maxResults || 6;
  const SHOW_ATC = cfg.showAtc !== false;

  const ROUTINE_CAP = { minimal: 2, standard: 4, full: 99 };

  // ── State ──────────────────────────────────────────────────────────────────
  const steps = Array.from(document.querySelectorAll('.quiz-step'));
  const totalSteps = steps.length;
  let currentIndex = 0;
  const answers = {};

  // ── Elements ───────────────────────────────────────────────────────────────
  const progressFill  = document.getElementById('quiz-progress-fill');
  const progressLabel = document.getElementById('quiz-progress-label');
  const resultsPanel  = document.getElementById('quiz-results');
  const productGrid   = document.getElementById('quiz-product-grid');
  const restartBtn    = document.getElementById('quiz-restart');

  // ── Progress ───────────────────────────────────────────────────────────────
  function updateProgress() {
    const pct = ((currentIndex + 1) / totalSteps) * 100;
    progressFill.style.width = pct + '%';
    progressLabel.textContent = `${currentIndex + 1} / ${totalSteps}`;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function showStep(idx) {
    steps.forEach((s, i) => s.classList.toggle('is-active', i === idx));
    const backBtn = steps[idx].querySelector('.quiz-nav__back');
    if (backBtn) backBtn.hidden = (idx === 0);
    updateProgress();
    steps[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function getStepAnswers(step) {
    const multi = step.dataset.multi === 'true';
    if (multi) {
      return Array.from(step.querySelectorAll('.quiz-option.is-selected input'))
        .map(i => i.value);
    } else {
      const sel = step.querySelector('.quiz-option.is-selected input');
      return sel ? [sel.value] : [];
    }
  }

  function advance() {
    const step = steps[currentIndex];
    const key = step.dataset.key;
    const vals = getStepAnswers(step);
    if (vals.length === 0) return; // require at least one selection
    answers[key] = vals;

    if (currentIndex < totalSteps - 1) {
      currentIndex++;
      showStep(currentIndex);
    }
  }

  function back() {
    if (currentIndex > 0) {
      currentIndex--;
      showStep(currentIndex);
    }
  }

  async function submit() {
    const step = steps[currentIndex];
    const key = step.dataset.key;
    const vals = getStepAnswers(step);
    if (vals.length === 0) return;
    answers[key] = vals;

    // Hide steps, show results
    steps.forEach(s => s.classList.remove('is-active'));
    document.getElementById('quiz-progress').setAttribute('aria-hidden', 'true');
    resultsPanel.classList.add('is-active');
    productGrid.innerHTML = '<p class="quiz-results__loading">Finding your routine…</p>';

    const products = await fetchAllProducts();
    const ranked = rankProducts(products);
    renderResults(ranked.slice(0, MAX_RESULTS));
  }

  // ── Option selection ───────────────────────────────────────────────────────
  document.querySelectorAll('.quiz-option').forEach(opt => {
    opt.addEventListener('click', e => {
      e.preventDefault();
      const step = opt.closest('.quiz-step');
      const multi = step.dataset.multi === 'true';
      if (!multi) {
        step.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('is-selected'));
      }
      opt.classList.toggle('is-selected');
    });
  });

  // ── Button wiring ──────────────────────────────────────────────────────────
  document.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', advance);
  });

  document.querySelectorAll('.quiz-nav__back').forEach(btn => {
    btn.addEventListener('click', back);
  });

  document.querySelector('.quiz-nav__submit')?.addEventListener('click', submit);

  restartBtn?.addEventListener('click', () => {
    Object.keys(answers).forEach(k => delete answers[k]);
    steps.forEach(s => {
      s.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('is-selected'));
    });
    currentIndex = 0;
    resultsPanel.classList.remove('is-active');
    document.getElementById('quiz-progress').removeAttribute('aria-hidden');
    showStep(0);
  });

  // ── Storefront fetch ───────────────────────────────────────────────────────
  async function fetchAllProducts() {
    if (!STOREFRONT_TOKEN || !SHOP_DOMAIN) return [];

    const METAFIELD_IDENTIFIERS = [
      'skin_type','skin_concern','shave_step','beard_length','beard_concern',
      'has_beard','hair_type','scalp_type','routine_step','time_of_day',
      'hold_level','fragrance_free','alcohol_free','sulfate_free',
    ].map(key => `{ namespace: "quiz", key: "${key}" }`).join('\n          ');

    const query = `{
      products(first: 250) {
        edges {
          node {
            id
            title
            handle
            url: onlineStoreUrl
            tags
            priceRange {
              minVariantPrice { amount currencyCode }
            }
            compareAtPriceRange {
              minVariantPrice { amount currencyCode }
            }
            featuredImage { url altText }
            variants(first: 1) {
              edges { node { id availableForSale } }
            }
            metafields(identifiers: [
              ${METAFIELD_IDENTIFIERS}
            ]) {
              key
              value
            }
          }
        }
      }
    }`;

    try {
      const res = await fetch(`https://${SHOP_DOMAIN}/api/2024-10/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
        },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      return json?.data?.products?.edges?.map(e => e.node) ?? [];
    } catch {
      return [];
    }
  }

  // ── Ranking ────────────────────────────────────────────────────────────────
  function parseMetafieldValues(metafields) {
    const map = {};
    (metafields || []).forEach(mf => {
      if (!mf) return;
      try {
        map[mf.key] = JSON.parse(mf.value);
      } catch {
        map[mf.key] = mf.value;
      }
    });
    return map;
  }

  function matchesAny(haystack, needles) {
    if (!needles || needles.length === 0) return false;
    const hay = Array.isArray(haystack) ? haystack.map(v => String(v).toLowerCase()) : [String(haystack).toLowerCase()];
    return needles.some(n => hay.includes(n.toLowerCase()));
  }

  function rankProducts(products) {
    const cap = ROUTINE_CAP[answers.routine_size?.[0]] ?? 99;

    return products
      .map(product => {
        const mf = parseMetafieldValues(product.metafields);
        const hasMetafields = Object.keys(mf).length > 0;
        const tags = new Set((product.tags || []).map(t => t.toLowerCase()));
        let score = 0;

        if (hasMetafields) {
          // skin_type — 3 pts per matching value
          (answers.skin_type || []).forEach(v => {
            if (matchesAny(mf.skin_type, [v])) score += 3;
          });

          // skin_concern — 2 pts per matching value
          (answers.skin_concern || []).forEach(v => {
            if (matchesAny(mf.skin_concern, [v])) score += 2;
          });

          // shave — 1 pt if shave_step matches
          (answers.shave || []).forEach(v => {
            if (matchesAny(mf.shave_step, [v])) score += 1;
          });

          // beard — 2 pts for has_beard, 1 pt for beard_length match
          if (answers.beard?.[0] && answers.beard[0] !== 'none') {
            if (mf.has_beard === true || mf.has_beard === 'true') score += 2;
            if (matchesAny(mf.beard_length, [answers.beard[0]])) score += 1;
          }

          // hair_type — 2 pts per matching value
          (answers.hair_type || []).forEach(v => {
            if (matchesAny(mf.hair_type, [v])) score += 2;
          });

          // scalp_type — 2 pts if matches
          (answers.scalp_type || []).forEach(v => {
            if (matchesAny(mf.scalp_type, [v])) score += 2;
          });
        } else {
          // Fallback: tag-based scoring for products without metafields
          (answers.skin_type || []).forEach(v => {
            if (tags.has(v.toLowerCase())) score += 3;
          });
          (answers.skin_concern || []).forEach(v => {
            if (tags.has(v.toLowerCase())) score += 2;
          });
          (answers.shave || []).forEach(v => {
            if (tags.has(v.toLowerCase())) score += 1;
          });
          if (answers.beard?.[0] && answers.beard[0] !== 'none') {
            if (tags.has('beard')) score += 2;
            if (tags.has(answers.beard[0].toLowerCase())) score += 1;
          }
          (answers.hair_type || []).forEach(v => {
            if (tags.has(v.toLowerCase())) score += 2;
          });
          (answers.scalp_type || []).forEach(v => {
            if (tags.has(v.toLowerCase())) score += 2;
          });
        }

        return { product, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, cap)
      .map(({ product }) => product);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function formatMoney(amount, currency) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(amount));
    } catch {
      return '$' + parseFloat(amount).toFixed(2);
    }
  }

  function renderResults(products) {
    if (products.length === 0) {
      productGrid.innerHTML = '<p class="quiz-results__empty">No exact matches — try a different selection.</p>';
      return;
    }

    productGrid.innerHTML = products.map(p => {
      const price = p.priceRange?.minVariantPrice;
      const comparePrice = p.compareAtPriceRange?.minVariantPrice;
      const variantId = p.variants?.edges?.[0]?.node?.id?.replace('gid://shopify/ProductVariant/', '');
      const available = p.variants?.edges?.[0]?.node?.availableForSale;
      const img = p.featuredImage?.url
        ? `<img src="${p.featuredImage.url}" alt="${(p.featuredImage.altText || p.title).replace(/"/g, '&quot;')}" loading="lazy" class="quiz-product-card__image">`
        : `<div class="quiz-product-card__image quiz-product-card__image--placeholder"></div>`;

      const compareHtml = comparePrice && parseFloat(comparePrice.amount) > parseFloat(price?.amount || 0)
        ? `<span class="quiz-product-card__price--compare">${formatMoney(comparePrice.amount, comparePrice.currencyCode)}</span>`
        : '';

      const atcHtml = SHOW_ATC && available && variantId ? `
        <form action="/cart/add" method="post" class="quiz-product-card__atc-form quiz-atc-form">
          <input type="hidden" name="id" value="${variantId}">
          <input type="hidden" name="quantity" value="1">
          <button type="submit" class="button quiz-product-card__atc-btn">Add to Cart</button>
        </form>` : '';

      return `
        <div class="quiz-product-card">
          <a href="${p.url || '/products/' + p.handle}" class="quiz-product-card__image-link">${img}</a>
          <div class="quiz-product-card__info">
            <a href="${p.url || '/products/' + p.handle}" class="quiz-product-card__title">${p.title}</a>
            <p class="quiz-product-card__price">
              ${compareHtml}
              <span>${price ? formatMoney(price.amount, price.currencyCode) : ''}</span>
            </p>
            ${atcHtml}
          </div>
        </div>`;
    }).join('');

    // ATC form handler — use /cart/add.js for cart drawer compatibility
    productGrid.querySelectorAll('.quiz-atc-form').forEach(form => {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = form.querySelector('button');
        const varId = form.querySelector('input[name="id"]').value;
        btn.disabled = true;
        btn.textContent = 'Adding…';
        try {
          await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: varId, quantity: 1 }),
          });
          btn.textContent = 'Added!';
          // Dispatch Shopify cart update event for drawers
          document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        } catch {
          btn.textContent = 'Error — try again';
        } finally {
          setTimeout(() => {
            btn.textContent = 'Add to Cart';
            btn.disabled = false;
          }, 2000);
        }
      });
    });
  }

  // ── Customer metafield persistence ─────────────────────────────────────────
  async function persistAnswersToCustomer(answersObj) {
    // Requires Storefront Customer Account API (shopify.com/authentication/2024-01/graphql.json)
    // Only available if the customer is logged in and the app has the customer account API enabled.
    const token = document.cookie.match(/customer_session_token=([^;]+)/)?.[1];
    if (!token) return;

    const metafields = Object.entries(answersObj).map(([key, val]) => ({
      namespace: 'quiz',
      key,
      value: Array.isArray(val) ? JSON.stringify(val) : String(val),
      type: Array.isArray(val) ? 'list.single_line_text_field' : 'single_line_text_field',
    }));

    const mutation = `
      mutation customerMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        customerMetafieldsSet(metafields: $metafields) {
          metafields { key value }
          userErrors { field message }
        }
      }`;

    try {
      await fetch(`https://${SHOP_DOMAIN}/account/customer/api/2024-01/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
        },
        body: JSON.stringify({ query: mutation, variables: { metafields } }),
      });
    } catch {
      // Silently fail — persistence is best-effort
    }
  }

  // Init
  showStep(0);
})();
