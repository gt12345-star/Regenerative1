// Cloudflare Pages Function. Answers at /geo with the visitor's country and state, as Cloudflare sees them.
export function onRequestGet({ request }) {
  const cf = request.cf || {};
  return new Response(JSON.stringify({ country: cf.country || "", region: cf.regionCode || "" }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" }
  });
}
