// Netlify Edge Function. Answers at /geo with the visitor's country and state, as Netlify sees them.
export default (request, context) => {
  const geo = context.geo || {};
  return new Response(JSON.stringify({ country: (geo.country && geo.country.code) || "", region: (geo.subdivision && geo.subdivision.code) || "" }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" }
  });
};
export const config = { path: "/geo" };
