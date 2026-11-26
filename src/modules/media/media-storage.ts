/**
 * Where an uploaded image ends up. Two drivers exist side by side on purpose:
 * a venue can switch to the CDN at any moment, and the pictures uploaded before
 * the switch must keep working — so every stored URL says, by its own shape,
 * which driver owns it.
 */
export abstract class MediaStorage {
  /** Writes the already re-encoded bytes and answers the public URL. */
  abstract save(
    bytes: Buffer,
    folder: string,
    fileName: string,
  ): Promise<string>;

  /** Removes a file this driver owns. Missing file is not an error. */
  abstract remove(publicUrl: string): Promise<void>;

  /** True when the URL was written by this driver. */
  abstract owns(publicUrl: string): boolean;
}
