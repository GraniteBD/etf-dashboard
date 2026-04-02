const https = require("https");

const FINNHUB_KEY = process.env.FINNHUB_KEY;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "X-Finnhub-Token": FINNHUB_KEY } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

exports.handler = async function (event) {
  const symbols = event.queryStringParameters && event.queryStringParameters.symbols;

  if (!symbols || !FINNHUB_KEY) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: !FINNHUB_KEY ? "Missing FINNHUB_KEY env var" : "symbols required" }),
    };
  }

  const tickers = symbols.split(",").map(s => s.trim()).filter(Boolean);

  try {
    // Fetch all quotes in parallel
    const results = await Promise.all(
      tickers.map(async (symbol) => {
        try {
          const [quote, profile] = await Promise.all([
            get(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`),
            get(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}`),
          ]);
          // Map Finnhub fields to Yahoo Finance shape so the dashboard works unchanged
          return {
            symbol,
            shortName: profile.name || symbol,
            regularMarketPrice: quote.c,                          // current price
            regularMarketChangePercent: quote.c && quote.pc
              ? ((quote.c - quote.pc) / quote.pc) * 100
              : null,
            regularMarketVolume: null,  // Finnhub free tier doesn't include volume in /quote
            totalAssets: null,          // ETF AUM not available on free tier
            regularMarketPreviousClose: quote.pc,
          };
        } catch {
          return null;
        }
      })
    );

    const filtered = results.filter(Boolean);

    // Wrap in Yahoo Finance quoteResponse shape so dashboard code needs no changes
    const body = JSON.stringify({
      quoteResponse: { result: filtered, error: null },
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
