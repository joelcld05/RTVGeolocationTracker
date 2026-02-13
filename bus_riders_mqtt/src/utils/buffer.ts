export function toBuffer(payload: Buffer | string | Array<Buffer | string>): Buffer {
  if (Buffer.isBuffer(payload)) return payload;
  if (Array.isArray(payload)) {
    return Buffer.concat(
      payload.map((item) =>
        Buffer.isBuffer(item) ? item : Buffer.from(String(item)),
      ),
    );
  }
  return Buffer.from(String(payload ?? ""), "utf8");
}
