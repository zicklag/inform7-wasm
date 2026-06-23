/** A flat map of virtual filesystem paths to file contents. */
export type VirtualFS = Record<string, Uint8Array>;

/**
 * Encode a virtual filesystem into a length-prefixed binary blob.
 *
 * Format: [pathLen:4][contentLen:4][path:pathLen][content:contentLen] repeated
 *
 * This is the inverse of {@link parseVirtualFS}. Use it to generate the
 * binary blob that can be loaded later with parseVirtualFS.
 *
 * @param files  The virtual filesystem to encode
 * @returns      The encoded binary blob
 */
export function encodeVirtualFS(files: VirtualFS): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (const [filePath, data] of Object.entries(files)) {
    const pathBytes = encoder.encode(filePath);

    const header = new Uint8Array(8);
    const view = new DataView(header.buffer);
    view.setUint32(0, pathBytes.length, true);
    view.setUint32(4, data.length, true);

    chunks.push(header, pathBytes, data);
  }

  const blob = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    blob.set(chunk, offset);
    offset += chunk.length;
  }

  return blob;
}

/**
 * Parse a length-prefixed binary blob into a virtual filesystem.
 *
 * Format: [pathLen:4][path:pathLen][contentLen:4][content:contentLen] repeated
 *
 * Perfect round-trip with {@link encodeVirtualFS} — no path manipulation
 * is performed, the paths in the blob are returned as-is.
 *
 * @param data  The binary blob produced by encodeVirtualFS
 * @returns     A flat path→Uint8Array map
 */
export function parseVirtualFS(data: Uint8Array): VirtualFS {
  const files: VirtualFS = {};
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  while (offset < data.length) {
    const pathLen = view.getUint32(offset, true);
    offset += 4;
    const contentLen = view.getUint32(offset, true);
    offset += 4;
    const path = new TextDecoder().decode(data.subarray(offset, offset + pathLen));
    offset += pathLen;
    files[path] = data.subarray(offset, offset + contentLen);
    offset += contentLen;
  }

  return files;
}

/**
 * Create a virtual project filesystem.
 *
 * @param source The Inform 7 source text
 * @returns A flat path→Uint8Array map for the project directory
 */
export function createVirtualProject(source: string): VirtualFS {
  const encoder = new TextEncoder();
  return {
    "/story/Source/story.ni": encoder.encode(source),
  };
}
