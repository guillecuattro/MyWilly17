// Vercel serverless function — fetches financial news from public RSS feeds
// No API key required

const RSS_FEEDS = [
  { name: "Reuters", url: "https://feeds.reuters.com/reuters/businessNews", lang: "en" },
  { name: "Reuters Mercados", url: "https://feeds.reuters.com/reuters/marketsNews", lang: "en" },
  { name: "Expansión", url: "https://e00-expansion.uecdn.es/rss/portada.xml", lang: "es" },
  { name: "Cinco Días", url: "https://cincodias.elpais.com/rss/cincodias/portada.xml", lang: "es" },
  { name: "FT Markets", url: "https://www.ft.com/markets?format=rss", lang: "en" },
];

// Keywords that affect each fund
const FUND_KEYWORDS = {
  msci: {
    positivo: ["wall street","s&p","nasdaq","tech","technology","ia","ai","artificial intelligence","growth","usa","eeuu","united states","fed rate cut","recorte","estímulo","stimulus","earnings","beneficios"],
    negativo: ["fed rate hike","subida tipos","inflation","inflación alta","recesión","recession","crash","desplome","bear market","geopolitical","guerra","war","aranceles","tariffs"],
  },
  emergentes: {
    positivo: ["china","emergentes","emerging","india","brasil","brazil","yuan","commodities","materias primas","stimulus china","estímulo china","fed rate cut","dólar débil","weak dollar"],
    negativo: ["dólar fuerte","strong dollar","fed hike","china slowdown","desaceleración china","emerging market","crisis","sanciones","sanctions","geopolitical"],
  },
  cobas: {
    positivo: ["value","energy","energía","petróleo","oil","gas","bancos","banks","materias primas","commodities","europa","europe","inflación","inflation","tipos altos","high rates"],
    negativo: ["tech rally","growth rally","fed cut","recorte tipos","deflación","deflation","recesión profunda"],
  },
  abaco: {
    positivo: ["bonos","bonds","renta fija","fixed income","tipos","rates","bce","fed","crédito","credit","investment grade","cupón","coupon"],
    negativo: ["default","impago","high yield crisis","spread","diferencial","inflación alta","high inflation","crisis deuda","debt crisis"],
  },
};

function analyzeImpact(text, fundId) {
  const lower = text.toLowerCase();
  const kw = FUND_KEYWORDS[fundId];
  if (!kw) return { impacto: "neutral", razon: "Sin datos suficientes" };

  let posScore = 0, negScore = 0;
  let posMatch = "", negMatch = "";

  for (const k of kw.positivo) {
    if (lower.includes(k)) { posScore++; if (!posMatch) posMatch = k; }
  }
  for (const k of kw.negativo) {
    if (lower.includes(k)) { negScore++; if (!negMatch) negMatch = k; }
  }

  if (posScore > negScore) return { impacto: "positivo", razon: `Mención de "${posMatch}"` };
  if (negScore > posScore) return { impacto: "negativo", razon: `Presión por "${negMatch}"` };
  return { impacto: "neutral", razon: "Impacto indirecto" };
}

function overallImpact(fondos) {
  const counts = { positivo: 0, negativo: 0, neutral: 0 };
  Object.values(fondos).forEach(f => counts[f.impacto]++);
  if (counts.positivo > counts.negativo) return "positivo";
  if (counts.negativo > counts.positivo) return "negativo";
  return "neutral";
}

async function fetchRSS(feed) {
  const r = await fetch(feed.url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml, application/xml, text/xml" }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

function parseRSS(xml, sourceName) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title   = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(item) || /<title>(.*?)<\/title>/.exec(item))?.[1] || "";
    const desc    = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(item) || /<description>(.*?)<\/description>/.exec(item))?.[1] || "";
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(item))?.[1] || "";
    const link    = (/<link>(.*?)<\/link>/.exec(item))?.[1] || "";

    // Clean HTML tags from description
    const cleanDesc = desc.replace(/<[^>]+>/g, "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').trim();
    const cleanTitle = title.replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").trim();

    if (cleanTitle && cleanTitle.length > 10) {
      items.push({ title: cleanTitle, desc: cleanDesc.slice(0, 200), pubDate, link, source: sourceName });
    }
    if (items.length >= 5) break;
  }
  return items;
}

function isFinancialNews(title, desc) {
  const text = (title + " " + desc).toLowerCase();
  const keywords = ["mercado","market","bolsa","stock","fondo","fund","fed","bce","ecb","banco central","central bank",
    "inflación","inflation","tipo","rate","pib","gdp","petróleo","oil","euro","dólar","dollar","china","economía",
    "economy","acciones","shares","bonos","bonds","crecimiento","growth","recesión","recession","aranceles","tariff"];
  return keywords.some(k => text.includes(k));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const fundIds = req.body?.fundIds || ["msci","emergentes","cobas","abaco"];

    // Fetch all RSS feeds in parallel
    const feedResults = await Promise.allSettled(
      RSS_FEEDS.map(feed => fetchRSS(feed).then(xml => parseRSS(xml, feed.name)))
    );

    // Collect and filter financial news
    const allItems = [];
    feedResults.forEach((r, i) => {
      if (r.status === "fulfilled") {
        r.value.forEach(item => {
          if (isFinancialNews(item.title, item.desc)) {
            allItems.push(item);
          }
        });
      }
    });

    // Deduplicate by title similarity and take top 5
    const seen = new Set();
    const unique = allItems.filter(item => {
      const key = item.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);

    // Analyze impact for each fund
    const noticias = unique.map(item => {
      const text = item.title + " " + item.desc;
      const fondos = {};
      fundIds.forEach(id => { fondos[id] = analyzeImpact(text, id); });

      // Parse date
      let hora = "Hoy";
      if (item.pubDate) {
        try {
          const d = new Date(item.pubDate);
          const diff = Date.now() - d.getTime();
          const h = Math.floor(diff / 3600000);
          hora = h < 1 ? "hace menos de 1h" : h < 24 ? `hace ${h}h` : d.toLocaleDateString("es-ES", {day:"2-digit", month:"short"});
        } catch {}
      }

      return {
        titulo:  item.title,
        resumen: item.desc || "Ver noticia completa en la fuente.",
        fuente:  item.source,
        hora,
        link:    item.link,
        impacto: overallImpact(fondos),
        fondos,
      };
    });

    // Overall sentiment
    const counts = { positivo:0, negativo:0, neutral:0 };
    noticias.forEach(n => counts[n.impacto]++);
    const sentimiento = counts.positivo > counts.negativo ? "positivo" : counts.negativo > counts.positivo ? "negativo" : "neutral";

    const titulares = { positivo:"Jornada alcista en los mercados", negativo:"Presión vendedora en los mercados", neutral:"Jornada de transición en los mercados" };
    const conclusiones = {
      positivo: "Los mercados muestran impulso positivo. Buen momento para revisar tus posiciones.",
      negativo: "Entorno de mayor incertidumbre. Mantén la calma y no tomes decisiones apresuradas.",
      neutral:  "Mercados sin dirección clara. Sigue tu plan de inversión a largo plazo.",
    };

    res.status(200).json({
      titular: titulares[sentimiento],
      sentimiento,
      conclusion: conclusiones[sentimiento],
      noticias,
      fetchedAt: new Date().toISOString(),
      fuentes: RSS_FEEDS.map(f => f.name),
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
