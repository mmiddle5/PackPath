// api/save-email.js
// Saves emails captured from the PackPath gate to Beehiiv
// Set BEEHIIV_API_KEY and BEEHIIV_PUB_ID in Vercel environment variables

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, source } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // Log it regardless so you always have a record in Vercel logs
  console.log(`New signup: ${email} via ${source || 'unknown'}`);

  // If Beehiiv is configured, subscribe them
  if (process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUB_ID) {
    try {
      const beehiivRes = await fetch(
        `https://api.beehiiv.com/v2/publications/${process.env.BEEHIIV_PUB_ID}/subscriptions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`
          },
          body: JSON.stringify({
            email,
            reactivate_existing: false,
            send_welcome_email: true,
            utm_source: source || 'packpath',
            utm_medium: 'organic',
            utm_campaign: 'email-gate'
          })
        }
      );
      const data = await beehiivRes.json();
      if (!beehiivRes.ok) {
        console.error('Beehiiv error:', data);
      }
    } catch (err) {
      // Don't fail the request if Beehiiv is down
      console.error('Beehiiv request failed:', err.message);
    }
  }

  return res.status(200).json({ ok: true });
}
