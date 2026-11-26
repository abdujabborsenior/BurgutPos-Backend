import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { MediaConfig } from '../../config/configuration';
import { BunnyMediaStorage } from './bunny-storage.service';

const CONFIG: MediaConfig = {
  driver: 'bunny',
  uploadDir: '/tmp/uploads',
  bunny: {
    storageHost: 'se.storage.bunnycdn.com',
    storageZone: 'burgut',
    accessKey: 'zone-password',
    pullZoneUrl: 'https://burgut.b-cdn.net',
    folder: 'pos',
  },
};

const config = (media: MediaConfig = CONFIG) =>
  ({ getOrThrow: () => media }) as unknown as ConfigService;

/** Replaces global fetch and records what the driver asked for. */
function mockFetch(reply: { status: number; body?: string }) {
  const calls: { url: string; init: RequestInit }[] = [];
  global.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      text: () => Promise.resolve(reply.body ?? ''),
    });
  }) as unknown as typeof fetch;
  return calls;
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe('BunnyMediaStorage', () => {
  it('uploads to the storage zone and answers the pull-zone URL', async () => {
    const calls = mockFetch({ status: 201 });
    const storage = new BunnyMediaStorage(config());

    const url = await storage.save(Buffer.from('bytes'), 'dishes', 'a.webp');

    expect(url).toBe('https://burgut.b-cdn.net/pos/dishes/a.webp');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://se.storage.bunnycdn.com/burgut/pos/dishes/a.webp',
    );
    expect(calls[0].init.method).toBe('PUT');
    // The zone password travels in the header and never in the URL.
    expect((calls[0].init.headers as Record<string, string>).AccessKey).toBe(
      'zone-password',
    );
    expect(calls[0].url).not.toContain('zone-password');
  });

  it('works without a folder prefix', async () => {
    mockFetch({ status: 201 });
    const storage = new BunnyMediaStorage(
      config({ ...CONFIG, bunny: { ...CONFIG.bunny, folder: '' } }),
    );

    expect(await storage.save(Buffer.from('b'), 'logo', 'x.webp')).toBe(
      'https://burgut.b-cdn.net/logo/x.webp',
    );
  });

  it('refuses to report success when Bunny did not store the file', async () => {
    mockFetch({ status: 401, body: 'unauthorized' });
    const storage = new BunnyMediaStorage(config());

    await expect(
      storage.save(Buffer.from('b'), 'dishes', 'a.webp'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('claims only its own pull-zone URLs', () => {
    const storage = new BunnyMediaStorage(config());

    expect(storage.owns('https://burgut.b-cdn.net/pos/dishes/a.webp')).toBe(
      true,
    );
    expect(storage.owns('/uploads/dishes/a.webp')).toBe(false);
    expect(storage.owns('https://other.b-cdn.net/pos/a.webp')).toBe(false);
  });

  it('claims nothing while the pull zone is not configured', () => {
    const storage = new BunnyMediaStorage(
      config({ ...CONFIG, bunny: { ...CONFIG.bunny, pullZoneUrl: '' } }),
    );

    expect(storage.owns('https://burgut.b-cdn.net/pos/a.webp')).toBe(false);
  });

  it('deletes by the path the public URL carries', async () => {
    const calls = mockFetch({ status: 200 });
    const storage = new BunnyMediaStorage(config());

    await storage.remove('https://burgut.b-cdn.net/pos/dishes/a.webp');

    expect(calls[0].url).toBe(
      'https://se.storage.bunnycdn.com/burgut/pos/dishes/a.webp',
    );
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('survives a failed delete: the dish is already saved without it', async () => {
    mockFetch({ status: 500, body: 'boom' });
    const storage = new BunnyMediaStorage(config());

    await expect(
      storage.remove('https://burgut.b-cdn.net/pos/dishes/a.webp'),
    ).resolves.toBeUndefined();
  });
});
