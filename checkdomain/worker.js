addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const CACHE_TTL = 3600;
// Updated URL to correct "latest release" download path
const CACHE_KEY = 'https://github.com/Skiddle-ID/blocklist/releases/latest/download/domains.txt';

async function getDomainList() {
  // Fetch follows redirects by default in Workers standard environment
  const response = await fetch(CACHE_KEY, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Checkdomain-Worker/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch domain list: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  // Filter out empty lines just in case
  const lines = text.split('\n').map(d => d.trim()).filter(d => d.length > 0);
  return lines;
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const refreshCache = url.searchParams.get('refresh');

  if (request.method === 'OPTIONS') {
    return handleOptionsRequest(request);
  }

  if (refreshCache === 'true') {
    await cacheDomainList();
    return new Response('Cache Refreshed!');
  }

  // Try to get from cache first, then fetch if missing
  let domainList = await getCachedDomainList();
  if (!domainList) {
    try {
      domainList = await getDomainList();
    } catch (e) {
      return new Response(`Error fetching blocklist: ${e.message}`, { status: 500 });
    }
  }

  const domainsParam = url.searchParams.get('domains');
  const domainParam = url.searchParams.get('domain');

  if (domainsParam && domainParam) {
    return new Response('Both domains and domain parameters cannot be provided simultaneously.', { status: 400 });
  }

  const responseObj = {};

  if (domainsParam) {
    const domainArray = domainsParam.split(',');
    domainArray.forEach(domain => {
      const cleanDomain = domain.trim();
      const isBlocked = domainList.includes(cleanDomain);
      responseObj[cleanDomain] = { blocked: isBlocked };
    });
  } else if (domainParam) {
    const cleanDomain = domainParam.trim();
    const isBlocked = domainList.includes(cleanDomain);
    responseObj[cleanDomain] = { blocked: isBlocked };
  } else {
    // If no params, maybe just show a helpful message or status
    return new Response('Please provide ?domain=example.com or ?domains=a.com,b.com', { status: 400 });
  }

  const jsonResponse = url.searchParams.get('json') === 'true';
  const responseBody = jsonResponse ? JSON.stringify(responseObj) : generatePlainTextResponse(responseObj);

  const headers = {
    'Content-Type': jsonResponse ? 'application/json' : 'text/plain',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  return new Response(responseBody, { headers });
}

async function handleOptionsRequest(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  return new Response(null, { headers });
}

function generatePlainTextResponse(responseObj) {
  let plaintextResponse = '';
  for (const domain in responseObj) {
    plaintextResponse += `${domain}: ${responseObj[domain].blocked ? 'Blocked' : 'Not Blocked'}!\n`;
  }
  return plaintextResponse;
}

async function getCachedDomainList() {
  const cache = caches.default;
  const response = await cache.match(CACHE_KEY); // Using URL as cache key
  if (response) {
    try {
      const data = await response.json();
      return data.domainList;
    } catch (error) {
      console.error('Error parsing cached domain list:', error);
    }
  }
  return null;
}

async function cacheDomainList() {
  const domainList = await getDomainList();
  const cache = caches.default;
  try {
    // Storing as a JSON object inside a Response
    await cache.put(CACHE_KEY, new Response(JSON.stringify({ domainList }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${CACHE_TTL}`
      }
    }));
  } catch (error) {
    console.error('Error caching domain list:', error);
  }
}
