export type SpaceImageResponse =
  | { ok: true; dataUrl: string; endpoint: string }
  | { ok: false; kind: 'http'; status: number; contentType: string | null; body: string; endpoint: string }
  | { ok: false; kind: 'protocol'; status: number; contentType: string | null; body: string; bodyBase64: string; endpoint: string };

/** Accept only a nonempty image response; preserve upstream failures and malformed successful responses. */
export async function readHuggingFaceSpaceImageResponse(
  response: Pick<Response, 'ok' | 'status' | 'headers' | 'arrayBuffer' | 'text'>,
  endpoint: string,
): Promise<SpaceImageResponse> {
  const contentType = response.headers.get('content-type');
  if (!response.ok) {
    return { ok: false, kind: 'http', status: response.status, contentType, body: await response.text(), endpoint };
  }

  const bytes = await response.arrayBuffer();
  const isImage = /^image\/[a-z0-9][a-z0-9.+-]*$/i.test((contentType || '').split(';', 1)[0].trim());
  if (!isImage || bytes.byteLength === 0) {
    const buffer = Buffer.from(bytes);
    return {
      ok: false,
      kind: 'protocol',
      status: response.status,
      contentType,
      body: buffer.toString('utf8'),
      bodyBase64: buffer.toString('base64'),
      endpoint,
    };
  }

  return {
    ok: true,
    dataUrl: `data:${contentType!.split(';', 1)[0].trim()};base64,${Buffer.from(bytes).toString('base64')}`,
    endpoint,
  };
}
