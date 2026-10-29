import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchBcvTodayRate } from './bcvSync';

const originalFetch = globalThis.fetch;

test('acepta una tasa USD positiva y conserva la fecha publicada por la fuente', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    USD: 874.7321,
    EUR: 950.25,
    effective_date: '2026-10-28',
    updated_at: '2026-10-28T13:00:00Z'
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    const result = await fetchBcvTodayRate();
    assert.equal(result.success, true);
    assert.equal(result.usd, 874.7321);
    assert.equal(result.eur, 950.25);
    assert.equal(result.effectiveDate, '2026-10-28');
    assert.equal(result.sourceUrl, 'https://bcv.today/api/rate.json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('prueba el endpoint alternativo cuando el principal responde con error HTTP', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith('/api/rate.json')) return new Response('unavailable', { status: 503 });
    return new Response(JSON.stringify({ rate: '875.125', date: '2026-10-29' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const result = await fetchBcvTodayRate();
    assert.equal(result.success, true);
    assert.equal(result.usd, 875.125);
    assert.equal(result.effectiveDate, '2026-10-29');
    assert.deepEqual(requested, [
      'https://bcv.today/api/rate.json',
      'https://bcv.today/api/v1/rate.json'
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rechaza tasas inválidas y no inventa una fecha efectiva', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    USD: 0,
    effective_date: 'not-a-date'
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    const result = await fetchBcvTodayRate();
    assert.equal(result.success, false);
    assert.equal(result.usd, 0);
    assert.equal(result.effectiveDate, '');
    assert.match(result.error || '', /tasa USD válida/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ante fallos de red devuelve un error y nunca una tasa válida inventada', async () => {
  globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;

  try {
    const result = await fetchBcvTodayRate();
    assert.equal(result.success, false);
    assert.equal(result.usd, 0);
    assert.equal(result.effectiveDate, '');
    assert.match(result.error || '', /offline/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
