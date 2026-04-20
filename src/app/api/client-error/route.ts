export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.error("[client-error]", payload);
  } catch (error) {
    console.error("[client-error] failed to parse payload", error);
  }

  return Response.json({ ok: true });
}
