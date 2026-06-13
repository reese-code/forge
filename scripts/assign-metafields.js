#!/usr/bin/env node
// Usage: node scripts/assign-metafields.js
// Requires .env with SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN

import 'dotenv/config';
import { createRequire } from 'module';

const { SHOPIFY_STORE, SHOPIFY_ADMIN_TOKEN } = process.env;

if (!SHOPIFY_STORE || !SHOPIFY_ADMIN_TOKEN) {
  console.error('Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN in .env');
  process.exit(1);
}

const NAMESPACE = 'quiz';
const API_VERSION = '2024-10';
const ENDPOINT = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;

// Metafield map — handle: { key: value }
const PRODUCTS = {
  'pre-shave-oil':           { skin_type: ['dry','normal','sensitive'], skin_concern: ['razor_burn','irritation','ingrown_hairs'], shave_step: 'pre_shave', beard_type: 'all' },
  'shave-soap-original':     { skin_type: ['normal','oily','combination'], skin_concern: ['razor_burn','irritation'], shave_step: 'shave', lather_preference: 'traditional' },
  'shave-cream-sensitive':   { skin_type: ['sensitive','dry'], skin_concern: ['redness','irritation','razor_burn'], shave_step: 'shave', fragrance_free: true },
  'aftershave-balm':         { skin_type: ['dry','sensitive','normal'], skin_concern: ['redness','irritation','dryness'], shave_step: 'post_shave', alcohol_free: true },
  'aftershave-tonic':        { skin_type: ['oily','combination','normal'], skin_concern: ['oiliness','enlarged_pores'], shave_step: 'post_shave' },
  'face-wash-daily':         { skin_type: ['all'], skin_concern: ['acne','oiliness'], routine_step: 'cleanse', time_of_day: ['AM','PM'] },
  'exfoliating-scrub':       { skin_type: ['normal','oily','combination'], skin_concern: ['ingrown_hairs','acne','dullness'], routine_step: 'exfoliate', use_frequency: '2x_week' },
  'serum-hydrating':         { skin_type: ['dry','normal','dehydrated'], skin_concern: ['dryness','fine_lines','dullness'], routine_step: 'treat', time_of_day: ['AM','PM'] },
  'serum-clarifying':        { skin_type: ['oily','combination','acne_prone'], skin_concern: ['acne','oiliness','enlarged_pores'], routine_step: 'treat', time_of_day: ['PM'] },
  'moisturizer-lightweight': { skin_type: ['oily','combination','normal'], routine_step: 'moisturize', time_of_day: ['AM'], texture: 'lightweight' },
  'moisturizer-rich':        { skin_type: ['dry','sensitive'], skin_concern: ['dryness','irritation','fine_lines'], routine_step: 'moisturize', texture: 'rich', time_of_day: ['PM'] },
  'eye-cream':               { skin_type: ['all'], skin_concern: ['dark_circles','puffiness','fine_lines'], routine_step: 'treat', target_zone: 'eye_contour' },
  'spf-moisturizer-daily':   { skin_type: ['all'], skin_concern: ['aging','sun_damage','hyperpigmentation'], routine_step: 'protect', time_of_day: ['AM'], spf: 40 },
  'hair-pomade-high-hold':   { hair_type: ['straight','wavy','thick'], hair_concern: ['hold','flyaways'], hold_level: 'high', finish: 'low_shine' },
  'hair-cream-curl-define':  { hair_type: ['wavy','curly','coily'], hair_concern: ['frizz','curl_definition','dryness'], hold_level: 'medium', finish: 'natural' },
  'shampoo-scalp-balancing': { hair_type: ['all'], hair_concern: ['scalp_oil','buildup','dandruff'], scalp_type: 'oily', sulfate_free: true },
  'conditioner-moisture':    { hair_type: ['dry','curly','coily','thick'], hair_concern: ['dryness','frizz','breakage'], scalp_type: 'dry' },
  'beard-oil':               { beard_length: ['short','medium','long'], beard_concern: ['itch','beardruff','dryness'], has_beard: true },
  'beard-balm':              { beard_length: ['medium','long'], beard_concern: ['stray_hairs','shape','coarseness'], has_beard: true, hold_level: 'light' },
};

function inferType(value) {
  if (Array.isArray(value)) return 'list.single_line_text_field';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number_integer';
  return 'single_line_text_field';
}

function serializeValue(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function getProductIdByHandle(handle) {
  const data = await gql(`
    query getProduct($handle: String!) {
      productByHandle(handle: $handle) { id }
    }
  `, { handle });
  return data.productByHandle?.id ?? null;
}

async function assignMetafields(productId, metafields) {
  const input = metafields.map(({ key, value, type }) => ({
    namespace: NAMESPACE,
    key,
    value,
    type,
  }));

  const data = await gql(`
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id handle }
        userErrors { field message }
      }
    }
  `, { input: { id: productId, metafields: input } });

  const { userErrors } = data.productUpdate;
  if (userErrors.length > 0) throw new Error(JSON.stringify(userErrors));
  return data.productUpdate.product;
}

async function run() {
  let passed = 0;
  let failed = 0;

  for (const [handle, fields] of Object.entries(PRODUCTS)) {
    try {
      const productId = await getProductIdByHandle(handle);
      if (!productId) {
        console.error(`SKIP  ${handle} — product not found`);
        failed++;
        continue;
      }

      const metafields = Object.entries(fields).map(([key, value]) => ({
        key,
        value: serializeValue(value),
        type: inferType(value),
      }));

      await assignMetafields(productId, metafields);
      console.log(`PASS  ${handle} — ${metafields.length} metafield(s) assigned`);
      passed++;
    } catch (err) {
      console.error(`FAIL  ${handle} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed`);
}

run();
