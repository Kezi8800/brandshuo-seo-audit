export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "BrandShuo SEO Audit API is running. Use POST with { url }."
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
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const startedAt = Date.now();

    const fetchWithTimeout = async (fetchUrl, options = {}, timeoutMs = 15000) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await fetch(fetchUrl, {
          ...options,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
    };

    const response = await fetchWithTimeout(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BrandShuoSEOAuditBot/1.2; +https://brandshuo.com)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const responseTime = Date.now() - startedAt;
    const html = await response.text();

    function cleanText(text) {
      return String(text || "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getTag(regex) {
      const match = html.match(regex);
      return match ? cleanText(match[1]) : "";
    }

    function getAll(regex) {
      return [...html.matchAll(regex)].map(m => cleanText(m[1])).filter(Boolean);
    }

    const title = getTag(/<title[^>]*>([\s\S]*?)<\/title>/i);

    const metaDescription =
      getTag(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
      getTag(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);

    const canonical =
      getTag(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i) ||
      getTag(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i);

    const robotsMeta =
      getTag(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
      getTag(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["'][^>]*>/i);

    const noindex = /noindex/i.test(robotsMeta);

    const h1s = getAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
    const h2s = getAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi);
    const h3s = getAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi);

    const images = [...html.matchAll(/<img[^>]*>/gi)].map(m => m[0]);
    const imagesWithoutAlt = images.filter(img => !/alt=["'][^"']+["']/i.test(img));

    const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
      .map(m => m[1])
      .filter(Boolean);

    const internalLinks = [];
    const externalLinks = [];
    const brokenLikeLinks = [];

    links.forEach(link => {
      if (
        link.startsWith("#") ||
        link.startsWith("mailto:") ||
        link.startsWith("tel:") ||
        link.startsWith("javascript:")
      ) return;

      try {
        const u = new URL(link, targetUrl);
        if (u.hostname === targetUrl.hostname) internalLinks.push(u.toString());
        else externalLinks.push(u.toString());
      } catch {
        brokenLikeLinks.push(link);
      }
    });

    const schemaCount = (html.match(/application\/ld\+json/gi) || []).length;
    const faqSchema = /"@type"\s*:\s*"FAQPage"/i.test(html);
    const productSchema = /"@type"\s*:\s*"Product"/i.test(html);
    const articleSchema = /"@type"\s*:\s*"Article"/i.test(html) || /"@type"\s*:\s*"BlogPosting"/i.test(html);
    const breadcrumbSchema = /"@type"\s*:\s*"BreadcrumbList"/i.test(html);

    const ogTitle = getTag(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i);
    const ogDescription = getTag(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
    const ogImage = getTag(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["'][^>]*>/i);
    const ogCount = (html.match(/property=["']og:/gi) || []).length;

    const twitterTitle = getTag(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["'][^>]*>/i);
    const twitterDescription = getTag(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
    const twitterImage = getTag(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']*)["'][^>]*>/i);
    const twitterCount = (html.match(/name=["']twitter:/gi) || []).length;

    const favicon =
      getTag(/<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']*)["'][^>]*>/i) ||
      getTag(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["'](?:shortcut icon|icon)["'][^>]*>/i);

    const hreflangCount = (html.match(/hreflang=/gi) || []).length;

    const bodyText = cleanText(html);
    const words = bodyText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    const paragraphCount = (html.match(/<p[\s>]/gi) || []).length;
    const listCount = (html.match(/<(ul|ol)[\s>]/gi) || []).length;
    const tableCount = (html.match(/<table[\s>]/gi) || []).length;

    let robots = false;
    let robotsUrl = `${targetUrl.origin}/robots.txt`;
    let sitemap = false;
    let sitemapUrl = `${targetUrl.origin}/sitemap.xml`;

    try {
      const robotsCheck = await fetchWithTimeout(robotsUrl, { method: "GET" }, 7000);
      robots = robotsCheck.ok;
    } catch {}

    try {
      const sitemapCheck = await fetchWithTimeout(sitemapUrl, { method: "GET" }, 7000);
      sitemap = sitemapCheck.ok;
    } catch {}

    const checks = [];

    function addCheck(category, name, status, message, weight = 5, fix = "") {
      checks.push({ category, name, status, message, weight, fix });
    }

    addCheck(
      "Technical SEO",
      "HTTP Status",
      response.ok ? "pass" : "fail",
      `HTTP ${response.status}`,
      10,
      "Make sure the page returns a clean 200 status."
    );

    addCheck(
      "Technical SEO",
      "Indexability",
      noindex ? "fail" : "pass",
      noindex ? `Robots meta: ${robotsMeta}` : "No noindex directive found.",
      10,
      "Remove noindex if this page should be indexed."
    );

    addCheck(
      "Technical SEO",
      "Canonical",
      canonical ? "pass" : "warning",
      canonical || "Missing canonical tag.",
      8,
      "Add a canonical tag to reduce duplicate URL risk."
    );

    addCheck(
      "Technical SEO",
      "robots.txt",
      robots ? "pass" : "warning",
      robots ? `Found: ${robotsUrl}` : "robots.txt not found.",
      6,
      "Add robots.txt to guide crawlers."
    );

    addCheck(
      "Technical SEO",
      "Sitemap",
      sitemap ? "pass" : "warning",
      sitemap ? `Found: ${sitemapUrl}` : "sitemap.xml not found.",
      6,
      "Submit a sitemap to help search engines discover URLs."
    );

    addCheck(
      "Technical SEO",
      "Hreflang",
      hreflangCount > 0 ? "pass" : "neutral",
      `${hreflangCount} hreflang tag(s) found.`,
      3,
      "Use hreflang only if the site has multilingual or multi-region versions."
    );

    addCheck(
      "Metadata",
      "Title Tag",
      title && title.length >= 30 && title.length <= 65 ? "pass" : "warning",
      title ? `${title.length} characters: ${title}` : "Missing title tag.",
      10,
      "Rewrite the title to 30–65 characters and include the main search intent."
    );

    addCheck(
      "Metadata",
      "Meta Description",
      metaDescription && metaDescription.length >= 80 && metaDescription.length <= 160 ? "pass" : "warning",
      metaDescription ? `${metaDescription.length} characters.` : "Missing meta description.",
      10,
      "Add a clear 80–160 character meta description."
    );

    addCheck(
      "Metadata",
      "Open Graph",
      ogCount >= 3 ? "pass" : "warning",
      `${ogCount} Open Graph tag(s).`,
      5,
      "Add og:title, og:description, and og:image for better social sharing."
    );

    addCheck(
      "Metadata",
      "Twitter Card",
      twitterCount >= 3 ? "pass" : "warning",
      `${twitterCount} Twitter Card tag(s).`,
      5,
      "Add twitter:title, twitter:description, and twitter:image."
    );

    addCheck(
      "Metadata",
      "Favicon",
      favicon ? "pass" : "warning",
      favicon || "Missing favicon.",
      3,
      "Add a favicon for trust and browser display."
    );

    addCheck(
      "Content SEO",
      "H1",
      h1s.length === 1 ? "pass" : "warning",
      `${h1s.length} H1 tag(s) found.`,
      8,
      "Use exactly one clear H1 matching the page topic."
    );

    addCheck(
      "Content SEO",
      "Heading Depth",
      h2s.length >= 3 ? "pass" : "warning",
      `${h2s.length} H2 tag(s), ${h3s.length} H3 tag(s).`,
      6,
      "Use H2/H3 headings to structure the page around search intent."
    );

    addCheck(
      "Content SEO",
      "Content Depth",
      wordCount >= 800 ? "pass" : wordCount >= 400 ? "warning" : "fail",
      `${wordCount} estimated words.`,
      8,
      "Expand content with useful sections, examples, FAQs, comparisons, and original insights."
    );

    addCheck(
      "Content SEO",
      "Content Formatting",
      paragraphCount >= 3 && (listCount > 0 || tableCount > 0) ? "pass" : "warning",
      `${paragraphCount} paragraphs, ${listCount} lists, ${tableCount} tables.`,
      4,
      "Use paragraphs, bullet lists, and comparison tables to improve readability."
    );

    addCheck(
      "Media SEO",
      "Image Alt Text",
      imagesWithoutAlt.length === 0 ? "pass" : "warning",
      `${images.length} image(s), ${imagesWithoutAlt.length} missing alt text.`,
      6,
      "Add descriptive alt text to important images."
    );

    addCheck(
      "Structured Data",
      "Schema",
      schemaCount > 0 ? "pass" : "warning",
      `${schemaCount} JSON-LD block(s).`,
      7,
      "Add JSON-LD schema such as Article, Product, FAQ, Review, or Breadcrumb."
    );

    addCheck(
      "Structured Data",
      "Schema Types",
      faqSchema || productSchema || articleSchema || breadcrumbSchema ? "pass" : "warning",
      [
        articleSchema ? "Article" : "",
        productSchema ? "Product" : "",
        faqSchema ? "FAQ" : "",
        breadcrumbSchema ? "Breadcrumb" : ""
      ].filter(Boolean).join(", ") || "No common schema type detected.",
      5,
      "Use schema types that match the page: Article for blog posts, Product for product pages, FAQ for Q&A sections."
    );

    addCheck(
      "Links",
      "Internal Links",
      internalLinks.length >= 5 ? "pass" : "warning",
      `${internalLinks.length} internal link(s).`,
      5,
      "Add relevant internal links to related pages and categories."
    );

    addCheck(
      "Links",
      "External Links",
      externalLinks.length >= 1 ? "pass" : "neutral",
      `${externalLinks.length} external link(s).`,
      3,
      "Use authoritative outbound references where helpful."
    );

    addCheck(
      "Performance",
      "Response Time",
      responseTime <= 1500 ? "pass" : responseTime <= 3000 ? "warning" : "fail",
      `${responseTime} ms.`,
      7,
      "Improve hosting, caching, image size, and script loading."
    );

    const scorableChecks = checks.filter(c => c.status !== "neutral");
    const totalWeight = scorableChecks.reduce((sum, c) => sum + c.weight, 0);
    const earnedWeight = scorableChecks.reduce((sum, c) => {
      if (c.status === "pass") return sum + c.weight;
      if (c.status === "warning") return sum + c.weight * 0.5;
      return sum;
    }, 0);

    const score = Math.round((earnedWeight / totalWeight) * 100);

    const categoryScores = {};
    scorableChecks.forEach(c => {
      if (!categoryScores[c.category]) {
        categoryScores[c.category] = { total: 0, earned: 0 };
      }

      categoryScores[c.category].total += c.weight;

      if (c.status === "pass") categoryScores[c.category].earned += c.weight;
      if (c.status === "warning") categoryScores[c.category].earned += c.weight * 0.5;
    });

    Object.keys(categoryScores).forEach(key => {
      categoryScores[key].score = Math.round(
        (categoryScores[key].earned / categoryScores[key].total) * 100
      );
    });

    const recommendations = checks
      .filter(c => c.status === "warning" || c.status === "fail")
      .map(c => ({
        category: c.category,
        issue: c.name,
        recommendation: c.fix
      }));

    const aiSearchReadiness = {
      score: Math.round(
        (
          (articleSchema || productSchema ? 20 : 0) +
          (faqSchema ? 20 : 0) +
          (h2s.length >= 5 ? 20 : 10) +
          (wordCount >= 1000 ? 20 : wordCount >= 600 ? 10 : 0) +
          (internalLinks.length >= 5 ? 10 : 0) +
          (metaDescription ? 10 : 0)
        )
      ),
      signals: {
        hasArticleOrProductSchema: articleSchema || productSchema,
        hasFAQSchema: faqSchema,
        strongHeadingStructure: h2s.length >= 5,
        enoughContentDepth: wordCount >= 1000,
        hasInternalLinks: internalLinks.length >= 5,
        hasMetaDescription: Boolean(metaDescription)
      }
    };

    return res.status(200).json({
      url: targetUrl.toString(),
      finalUrl: response.url,
      status: response.status,
      responseTime,
      score,
      categoryScores,
      title,
      metaDescription,
      canonical,
      robotsMeta,
      noindex,
      h1s,
      h2s: h2s.slice(0, 20),
      h3Count: h3s.length,
      imageCount: images.length,
      imagesWithoutAlt: imagesWithoutAlt.length,
      schemaCount,
      schemaTypes: {
        article: articleSchema,
        product: productSchema,
        faq: faqSchema,
        breadcrumb: breadcrumbSchema
      },
      social: {
        ogCount,
        ogTitle,
        ogDescription,
        ogImage,
        twitterCount,
        twitterTitle,
        twitterDescription,
        twitterImage
      },
      favicon,
      hreflangCount,
      robots,
      robotsUrl,
      sitemap,
      sitemapUrl,
      wordCount,
      paragraphCount,
      listCount,
      tableCount,
      internalLinks: internalLinks.length,
      externalLinks: externalLinks.length,
      brokenLikeLinks: brokenLikeLinks.length,
      aiSearchReadiness,
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
