// Vercel Function. Answers at /api/geo with the visitor's country and state, from the headers Vercel adds.
export function GET(request) {
  return new Response(JSON.stringify({ country: request.headers.get("x-vercel-ip-country") || "", region: request.headers.get("x-vercel-ip-country-region") || "" }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" }
  });
}
