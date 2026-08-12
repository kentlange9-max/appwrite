export default async ({ req, res, log, error }) => {
    // Appwrite parses the raw URL and query parameters for us
    const targetUrl = req.query.xtargeturl || req.headers['x-target-url'];

    if (!targetUrl) {
        return res.send("Missing xtargeturl or x-target-url header/query", 400);
    }

    log(`Proxying request to: ${targetUrl}`);

    // Generate a completely fake random IP to spoof the X-Forwarded-For header
    const fakeIp = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    // Build headers for the upstream request
    const upstreamHeaders = new Headers();
    
    // Copy all original headers except the snitch ones
    for (const [key, value] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (!['x-target-url', 'host', 'x-appwrite-trigger', 'x-appwrite-event', 'x-appwrite-user-id', 'x-appwrite-user-jwt'].includes(lowerKey)) {
            upstreamHeaders.set(key, value);
        }
    }

    // Hard-spoof browser headers so use.ai doesn't block it
    upstreamHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    upstreamHeaders.set('Origin', 'https://use.ai');
    upstreamHeaders.set('Referer', 'https://use.ai/');
    
    // Lie about where we came from
    upstreamHeaders.set('X-Forwarded-For', fakeIp);
    upstreamHeaders.set('True-Client-IP', fakeIp);
    upstreamHeaders.set('CF-Connecting-IP', fakeIp);

    try {
        const fetchOptions = {
            method: req.method,
            headers: upstreamHeaders,
            redirect: 'manual'
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.bodyRaw) {
            fetchOptions.body = req.bodyRaw;
        }

        const response = await fetch(targetUrl, fetchOptions);
        
        // Convert headers to a plain object for Appwrite res.send()
        const resHeaders = {};
        response.headers.forEach((value, key) => {
            resHeaders[key] = value;
        });

        // Ensure CORS if needed
        resHeaders['Access-Control-Allow-Origin'] = '*';
        
        const bodyText = await response.text();
        
        return res.send(bodyText, response.status, resHeaders);
    } catch (err) {
        error(`Fetch failed: ${err.message}`);
        return res.json({ error: err.message }, 500);
    }
};
