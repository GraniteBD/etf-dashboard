const https = require("https");

function fetchURL(url, options) {
  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

exports.handler = async function (event) {
  const symbols = event.queryStringParameters && event.queryStringParameters.symbols;

  if (!symbols) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "symbols parameter required" }),
    };
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    "Referer": "https://finance.yahoo.com/",
    "Connection": "keep-alive",
  };

  // Try both Yahoo Finance endpoints
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,totalAssets,shortName,regularMarketPreviousClose`,
    `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,totalAssets,shortName,regularMarketPreviousClose`,
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`,
  ];

  for (const url of urls) {
    try {
      const result = await fetchURL(url, { headers });
      if (result.status === 200 && result.body.includes("regularMarketPrice")) {
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: result.body,
        };
      }
    } catch (err) {
      console.log(`Failed ${url}: ${err.message}`);
    }
  }

  return {
    statusCode: 502,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ error: "All Yahoo Finance endpoints failed" }),
  };
};