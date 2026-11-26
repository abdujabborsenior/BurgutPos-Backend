import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Smoke e2e test. Requires a reachable PostgreSQL configured through .env
 * (migrations run automatically on start).
 */
describe('BurgutPOS API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health', () =>
    request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((response) =>
        expect((response.body as { status: string }).status).toBe('ok'),
      ));

  it('rejects unauthenticated requests', () =>
    request(app.getHttpServer()).get('/api/auth/me').expect(401));
});
