/**
 * Automated News Aggregator & Curator for ZPGHS Gajwel School Website
 * Fetches RSS feeds from The Hindu (Telangana, National, International, Sports) and Deccan Chronicle,
 * plus live Weather from Open-Meteo for Gajwel/Telangana.
 * Curates and saves the Top 10 stories to news.json.
 */

const fs = require('fs');
const path = require('path');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

function cleanEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

function cleanSummary(rawText, title, category, source) {
  if (rawText) {
    let clean = cleanEntities(rawText.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    if (clean && clean.length > 20) {
      const match = clean.match(/^(.+?[.!?])(?:\s|$)/);
      let sentence = match ? match[1].trim() : clean;
      if (sentence.length > 180) {
        sentence = sentence.substring(0, 177).trim() + '...';
      }
      return sentence;
    }
  }

  // Fallback 1-sentence contextual summary when RSS description is empty
  if (category === 'Telangana') {
    return `Latest regional report from Telangana covering key developments and governance updates as reported by ${source}.`;
  } else if (category === 'National') {
    return `National news bulletin from India covering major policy, administrative, and public updates reported by ${source}.`;
  } else if (category === 'International') {
    return `Global affairs and international briefing covering key worldwide events reported by ${source}.`;
  } else if (category === 'Sports') {
    return `Sports roundup highlighting recent tournament results, matches, and athletic performances reported by ${source}.`;
  }
  return `Daily morning news digest update reported by ${source}.`;
}

function parseXmlItems(xmlText, sourceName, defaultCategory) {
  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemStr = match[0];

    // Extract title
    const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
    const title = cleanEntities((titleMatch ? (titleMatch[1] || titleMatch[2] || '') : '').trim());

    // Extract link
    const linkMatch = itemStr.match(/<link>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/i);
    const link = (linkMatch ? (linkMatch[1] || linkMatch[2] || '') : '').trim();

    // Extract image if available
    let imageUrl = '';
    const mediaMatch = itemStr.match(/<media:content[^>]+url=["']([^"']+)["']/i) || itemStr.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (mediaMatch) {
      imageUrl = mediaMatch[1];
    }

    // Extract category if available in item
    const catMatch = itemStr.match(/<category>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/category>/i);
    let itemCategory = defaultCategory;
    if (catMatch) {
      const rawCat = (catMatch[1] || catMatch[2] || '').trim();
      if (/telangana|hyderabad|warangal|nizamabad|siddipet|medak/i.test(rawCat)) itemCategory = 'Telangana';
      else if (/national|india|nation/i.test(rawCat)) itemCategory = 'National';
      else if (/world|international/i.test(rawCat)) itemCategory = 'International';
      else if (/sport|cricket|football/i.test(rawCat)) itemCategory = 'Sports';
    }

    // Auto-detect category from title keywords
    if (itemCategory === 'National' || itemCategory === 'General') {
      if (/telangana|hyderabad|gajwel|medak|siddipet|kcr|revanth|tgspdcl|tgtransco|tsche|bjp telangana|brs/i.test(title)) {
        itemCategory = 'Telangana';
      } else if (/cricket|ipl|football|tennis|badminton|olympics|hockey|chess|fifa|wicket|bcci|bgt|test series/i.test(title)) {
        itemCategory = 'Sports';
      } else if (/trump|putin|ukraine|russia|israel|gaza|white house|china|beijing|pakistan|bangladesh|syria/i.test(title)) {
        itemCategory = 'International';
      }
    }

    // Extract description
    const descMatch = itemStr.match(/<(?:description|summary)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:description|summary)>/i);
    const rawDesc = (descMatch ? (descMatch[1] || descMatch[2] || '') : '').trim();
    const summary = cleanSummary(rawDesc, title, itemCategory, sourceName);

    // Extract pubDate
    const pubDateMatch = itemStr.match(/<pubDate>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/pubDate>/i);
    const pubDate = (pubDateMatch ? (pubDateMatch[1] || pubDateMatch[2] || '') : '').trim();

    if (title && link) {
      items.push({
        title,
        link,
        summary,
        category: itemCategory,
        source: sourceName,
        imageUrl: imageUrl || null,
        pubDate: pubDate || new Date().toUTCString()
      });
    }
  }

  return items;
}

async function fetchFeed(url, sourceName, category) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`[WARN] Failed to fetch ${url} - Status ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseXmlItems(xml, sourceName, category);
  } catch (err) {
    console.error(`[ERROR] Exception fetching ${url}:`, err.message);
    return [];
  }
}

async function fetchGajwelWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=17.85&longitude=78.68&current_weather=true';
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.current_weather) return null;

    const weather = data.current_weather;
    const temp = Math.round(weather.temperature);
    const wind = Math.round(weather.windspeed);
    const code = weather.weathercode;

    // Interpret weather code
    let condition = 'Pleasant & Clear';
    if (code === 0) condition = 'Clear Sunny Sky';
    else if (code >= 1 && code <= 3) condition = 'Partly Cloudy';
    else if (code >= 45 && code <= 48) condition = 'Misty Fog';
    else if (code >= 51 && code <= 67) condition = 'Light Rain Showers';
    else if (code >= 80 && code <= 99) condition = 'Thunderstorms & Rain';

    return {
      title: `Gajwel Weather: ${temp}°C, ${condition}`,
      link: 'https://open-meteo.com/en/docs',
      summary: `Current local weather in Gajwel, Siddipet District: ${temp}°C with ${condition.toLowerCase()} and winds at ${wind} km/h. Suitable for regular school schedule.`,
      category: 'Weather',
      source: 'Open-Meteo',
      imageUrl: null,
      pubDate: new Date().toUTCString(),
      weatherMeta: { temp, condition, wind }
    };
  } catch (err) {
    console.warn('[WARN] Weather fetch error:', err.message);
    return null;
  }
}

function deduplicateStories(stories) {
  const seenTitles = new Set();
  const seenLinks = new Set();
  const unique = [];

  for (const s of stories) {
    const normTitle = s.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 45);
    const normLink = s.link.split('?')[0].toLowerCase();

    if (!seenTitles.has(normTitle) && !seenLinks.has(normLink)) {
      seenTitles.add(normTitle);
      seenLinks.add(normLink);
      unique.push(s);
    }
  }

  return unique;
}

async function main() {
  console.log('--- Starting Daily News Aggregation (6:00 AM IST) ---');
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffsetMs);
  const istString = istTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });

  // 1. Fetch feeds in parallel
  const [
    hinduTelangana,
    hinduNational,
    hinduWorld,
    hinduSport,
    deccanGeneral,
    gajwelWeather
  ] = await Promise.all([
    fetchFeed('https://www.thehindu.com/news/national/telangana/feeder/default.rss', 'The Hindu', 'Telangana'),
    fetchFeed('https://www.thehindu.com/news/national/feeder/default.rss', 'The Hindu', 'National'),
    fetchFeed('https://www.thehindu.com/news/international/feeder/default.rss', 'The Hindu', 'International'),
    fetchFeed('https://www.thehindu.com/sport/feeder/default.rss', 'The Hindu', 'Sports'),
    fetchFeed('https://www.deccanchronicle.com/rss_feed/', 'Deccan Chronicle', 'General'),
    fetchGajwelWeather()
  ]);

  console.log(`Fetched counts:`);
  console.log(`  The Hindu (Telangana): ${hinduTelangana.length}`);
  console.log(`  The Hindu (National):  ${hinduNational.length}`);
  console.log(`  The Hindu (World):     ${hinduWorld.length}`);
  console.log(`  The Hindu (Sports):    ${hinduSport.length}`);
  console.log(`  Deccan Chronicle:      ${deccanGeneral.length}`);
  console.log(`  Gajwel Weather:        ${gajwelWeather ? 'Available' : 'Unavailable'}`);

  // 2. Classify Deccan Chronicle general stories into categories
  const dcTelangana = [];
  const dcNational = [];
  const dcSports = [];
  const dcWorld = [];

  for (const item of deccanGeneral) {
    if (item.category === 'Telangana') dcTelangana.push(item);
    else if (item.category === 'Sports') dcSports.push(item);
    else if (item.category === 'International') dcWorld.push(item);
    else dcNational.push(item);
  }

  // 3. Select balanced curation prioritizing Telangana:
  const selectedStories = [];

  // Weather item
  if (gajwelWeather) {
    selectedStories.push(gajwelWeather);
  }

  // Telangana stories (up to 4)
  const telanganaPool = deduplicateStories([...hinduTelangana, ...dcTelangana]);
  selectedStories.push(...telanganaPool.slice(0, 4));

  // National stories (up to 2)
  const nationalPool = deduplicateStories([...hinduNational, ...dcNational]);
  selectedStories.push(...nationalPool.slice(0, 2));

  // International stories (up to 2)
  const worldPool = deduplicateStories([...hinduWorld, ...dcWorld]);
  selectedStories.push(...worldPool.slice(0, 2));

  // Sports stories (up to 2)
  const sportsPool = deduplicateStories([...hinduSport, ...dcSports]);
  selectedStories.push(...sportsPool.slice(0, 2));

  // Deduplicate and trim to exactly 10 top items
  let finalStories = deduplicateStories(selectedStories);

  if (finalStories.length < 10) {
    const filler = deduplicateStories([...telanganaPool, ...nationalPool, ...sportsPool, ...worldPool]);
    for (const item of filler) {
      if (finalStories.length >= 10) break;
      if (!finalStories.some(s => s.link === item.link || s.title === item.title)) {
        finalStories.push(item);
      }
    }
  }

  finalStories = finalStories.slice(0, 10).map((story, idx) => ({
    id: idx + 1,
    title: story.title,
    summary: story.summary,
    category: story.category,
    source: story.source,
    url: story.link,
    imageUrl: story.imageUrl || null,
    pubDate: story.pubDate,
    weatherMeta: story.weatherMeta || null
  }));

  const newsData = {
    lastUpdated: istTime.toISOString(),
    formattedDate: istString,
    edition: 'Daily 6:00 AM IST Digest',
    totalStories: finalStories.length,
    sources: ['The Hindu', 'Deccan Chronicle', 'Open-Meteo'],
    stories: finalStories
  };

  const outputPath = path.join(__dirname, '..', 'news.json');
  fs.writeFileSync(outputPath, JSON.stringify(newsData, null, 2), 'utf8');

  console.log(`\nSuccessfully curated ${finalStories.length} stories into ${outputPath}`);
  finalStories.forEach(s => {
    console.log(`  [${s.category}] (${s.source}) ${s.title}`);
  });
}

main().catch(err => {
  console.error('[FATAL] Script error:', err);
  process.exit(1);
});
