export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "BrandShuo SEO Audit API is running. Please use POST request."
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body || {};

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    let targetUrl;

    try {
      targetUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch (e) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;

    try {
      response = await fetch(targetUrl.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BrandShuoSEOAuditBot/1.0; +https://brandshuo.com)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    const html = await response.text();

    function cleanText(text) {
      return String(text || "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getTag(regex) {
      const match = html.match(regex);
      return match ? cleanText(match[1]) : "";
    }

    const title = getTag(/<title[^>]*>([\s\S]*?)<\/title>/i);

    const metaDescription =
      getTag(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
      getTag(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);

    const canonical =
      getTag(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i) ||
      getTag(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i);

    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
      .map(m => cleanText(m[1]))
      .filter(Boolean);

    const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
      .map(m => cleanText(m[1]))
      .filter(Boolean);

    const images = [...html.matchAll(/<img[^>]*>/gi)].map(m => m[0]);
    const imagesWithoutAlt = images.filter(img => !/alt=["'][^"']+["']/i.test(img));

    const schemaCount = (
      html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>/gi) || []
    ).length;

    const hasNoindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);

    const bodyText = cleanText(html);
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

    const checks = [];

    function addCheck(name, status, message, weight) {
      checks.push({ name, status, message, weight });
    }

    addCheck(
      "HTTP Status",
      response.ok ? "pass" : "fail",
      `HTTP status: ${response.status}`,
      10
    );

    addCheck(
      "Title Tag",
      title && title.length >= 30 && title.length <= 65 ? "pass" : "warning",
      title ? `Title length: ${title.length} characters.` : "Missing title tag.",
      10
    );

    addCheck(
      "Meta Description",
      metaDescription && metaDescription.length >= 80 && metaDescription.length <= 160 ? "pass" : "warning",
      metaDescription
        ? `Meta description length: ${metaDescription.length} characters.`
        : "Missing meta description.",
      10
    );

    addCheck(
      "H1 Tag",
      h1s.length === 1 ? "pass" : "warning",
      h1s.length === 0 ? "Missing H1 tag." : `${h1s.length} H1 tag(s) found.`,
      10
    );

    addCheck(
      "Canonical URL",
      canonical ? "pass" : "warning",
      canonical ? `Canonical found: ${canonical}` : "Missing canonical tag.",
      8
    );

    addCheck(
      "Image Alt Text",
      imagesWithoutAlt.length === 0 ? "pass" : "warning",
      `${images.length} image(s) found, ${imagesWithoutAlt.length} missing alt text.`,
      8
    );

    addCheck(
      "Structured Data",
      schemaCount > 0 ? "pass" : "warning",
      schemaCount > 0
        ? `${schemaCount} JSON-LD schema block(s) found.`
        : "No JSON-LD structured data found.",
      8
    );

    addCheck(
      "Indexability",
      hasNoindex ? "fail" : "pass",
      hasNoindex ? "Page contains noindex directive." : "No noindex directive found.",
      10
    );

    addCheck(
      "Content Depth",
      wordCount >= 500 ? "pass" : "warning",
      `Estimated word count: ${wordCount}.`,
      8
    );

    addCheck(
      "Heading Structure",
      h2s.length > 0 ? "pass" : "warning",
      h2s.length > 0 ? `${h2s.length} H2 tag(s) found.` : "No H2 tags found.",
      6
    );

    const totalWeight = checks.reduce((sum, item) => sum + item.weight, 0);
    const earnedWeight = checks.reduce((sum, item) => {
      if (item.status === "pass") return sum + item.weight;
      if (item.status === "warning") return sum + item.weight * 0.5;
      return sum;
    }, 0);

    const score = Math.round((earnedWeight / totalWeight) * 100);

    const recommendations = checks
      .filter(item => item.status !== "pass")
      .map(item => {
        switch (item.name) {
          case "Title Tag":
            return "Rewrite the title to around 30–65 characters and include the primary search intent.";
          case "Meta Description":
            return "Add a clear meta description around 80–160 characters.";
          case "H1 Tag":
            return "Use one clear H1 that matches the page topic.";
          case "Canonical URL":
            return "Add a canonical tag to reduce duplicate URL risk.";
          case "Image Alt Text":
            return "Add descriptive alt text to important images.";
          case "Structured Data":
            return "Add relevant JSON-LD schema such as Article, Product, FAQ, Review, or Breadcrumb.";
          case "Indexability":
            return "Remove noindex if this page should appear in search engines.";
          case "Content Depth":
            return "Expand the page with useful sections, FAQs, comparisons, and original insights.";
          case "Heading Structure":
            return "Add H2 sections to organize the page clearly.";
          default:
            return item.message;
        }
      });

    return res.status(200).json({
      url: targetUrl.toString(),
      finalUrl: response.url,
      status: response.status,
      score,
      title,
      metaDescription,
      canonical,
      h1s,
      h2Count: h2s.length,
      imageCount: images.length,
      imagesWithoutAlt: imagesWithoutAlt.length,
      schemaCount,
      noindex: hasNoindex,
      wordCount,
      checks,
      recommendations,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: "Audit failed",
      detail: error.message || "Unknown error"
    });
  }
}
