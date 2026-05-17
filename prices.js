// Vercel serverless function — fetches NAV prices directly from public sources
// No API key required

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { funds } = req.body;
    if (!funds || !Array.isArray(funds)) {
      return res.status(400).json({ error: 'funds array required' });
    }

    const results = await Promise.allSettled(funds.map(f => fetchNav(f)));
    const fondos = results.map((r, i) => ({
      id:     funds[i].id,
      isin:   funds[i].isin,
      name:   funds[i].name,
      nav:    r.status === 'fulfilled' ? r.value.nav : null,
      fecha:  r.status === 'fulfilled' ? r.value.fecha : null,
      fuente: r.status === 'fulfilled' ? r.value.fuente : null,
      error:  r.status === 'rejected'  ? r.reason?.message : null,
    }));

    res.status(200).json({ fondos, updatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function fetchNav(fund) {
  const { isin } = fund;

  // ── 1. Try JustETF (works for ETFs and index funds) ──────────
  try {
    const url = `https://www.justetf.com/api/etfs/${isin}/performance-chart?locale=es&valuesType=MARKET_VALUE&startDate=&endDate=`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (r.ok) {
      const d = await r.json();
      const last = d?.series?.[d.series.length - 1];
      if (last?.date && last?.value) {
        return { nav: last.value, fecha: last.date, fuente: 'JustETF' };
      }
    }
  } catch {}

  // ── 2. Try Morningstar API ───────────────────────────────────
  try {
    const searchUrl = `https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener?page=1&pageSize=1&sortOrder=LegalName%20asc&outputType=json&version=1&languageId=es-ES&currencyId=EUR&universeIds=FOEUR$$ALL&securityDataPoints=SecId%2CName%2CISIN%2COngoingCharge%2CPriceCurrency%2CTenforeId%2CClosePrice%2CClosePriceDate&filters=ISIN%3AIN%3A${isin}`;
    const r = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (r.ok) {
      const d = await r.json();
      const fund = d?.rows?.[0];
      if (fund?.ClosePrice && fund?.ClosePriceDate) {
        return { nav: parseFloat(fund.ClosePrice), fecha: fund.ClosePriceDate, fuente: 'Morningstar' };
      }
    }
  } catch {}

  // ── 3. Try Financial Times ───────────────────────────────────
  try {
    const ftUrl = `https://markets.ft.com/data/funds/ajax/get-summary-data?isin=${isin}`;
    const r = await fetch(ftUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (r.ok) {
      const d = await r.json();
      const price = d?.data?.nav?.value || d?.data?.price?.value;
      const date  = d?.data?.nav?.date  || d?.data?.price?.date;
      if (price) {
        return { nav: parseFloat(price), fecha: date, fuente: 'FT Markets' };
      }
    }
  } catch {}

  throw new Error(`No se pudo obtener NAV para ${isin}`);
}
