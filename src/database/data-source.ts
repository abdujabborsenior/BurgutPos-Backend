import 'dotenv/config';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/configuration';
import { buildDataSourceOptions } from './typeorm.options';

/** DataSource used by the TypeORM CLI (migration:generate / run / revert). */
export default new DataSource(buildDataSourceOptions(loadConfig().db));
