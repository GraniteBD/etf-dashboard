const https = require("https");

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

function get(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on("error", reject);
  });
}

exports.handler = async function (event) {
  const symbols = event.queryStringParameters && event.queryStringParameters.symbols;
  const mode    = event.queryStringParameters && event.queryStringParameters.mode;

  if (!symbols) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "symbols parameter required" }),
    };
  }

  if (!RAPIDAPI_KEY) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing RAPIDAPI_KEY environment variable" }),
    };
  }

  const tickers = symbols.split(",").map(s => s.trim()).filter(Boolean);

  // ── MODE: AUM ─────────────────────────────────────────────────────────────
  // Uses SteadyAPI statistics module — called once per day, results cached client-side
  if (mode === "aum") {
    const headers = {
      "x-rapidapi-key":  RAPIDAPI_KEY,
      "x-rapidapi-host": "yahoo-finance15.p.rapidapi.com",
    };

    const results = await Promise.all(
      tickers.map(async (symbol) => {
        try {
          const url = `https://yahoo-finance15.p.rapidapi.com/api/v1/markets/stock/modules?ticker=${encodeURIComponent(symbol)}&module=statistics`;
          const data = await get(url, headers);
          const totalAssets = data?.body?.totalAssets?.raw ?? null;
          return { symbol, totalAssets };
        } catch (err) {
          return { symbol, totalAssets: null, debug: err.message };
        }
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ aum: results }),
    };
  }

  // ── MODE: QUOTES (default) ────────────────────────────────────────────────
  // Uses 3B Data — bulk endpoint, all tickers in one call
  // Chunked into batches of 100
  const headers = {
    "x-rapidapi-key":  RAPIDAPI_KEY,
    "x-rapidapi-host": "yahoo-finance-real-time1.p.rapidapi.com",
    "Content-Type":    "application/json",
  };

  const BATCH = 100;
  const chunks = [];
  for (let i = 0; i < tickers.length; i += BATCH) {
    chunks.push(tickers.slice(i, i + BATCH));
  }

  const allResults = [];
  for (const chunk of chunks) {
    try {
      const url = `https://yahoo-finance-real-time1.p.rapidapi.com/market/get-quotes?symbols=${chunk.join(",")}&region=US`;
      const data = await get(url, headers);
      const results = data?.quoteResponse?.result || [];
      allResults.push(...results);
    } catch (err) {
      console.log(`Chunk failed: ${err.message}`);
    }
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      quoteResponse: { result: allResults, error: null },
    }),
  };
};
