// data-source.ts
import { DataSource } from 'typeorm';
import { UserEntity } from '../modules/users/entities/user.entity';
import { JournalEntity } from '../modules/journal/entites/journal.entity';


import * as path from "path";
import * as dotenv from "dotenv";

const envPath = path.join(
  process.cwd(),
  process.env.NODE_ENV ? `envs/.env.${process.env.NODE_ENV}` : `/.env`,
);

dotenv.config({ path: envPath });

console.log(`process.env.NODE_ENV`, process.env);

export default new DataSource({
  type: 'postgres',
  url: `${process.env.DATABASE_URL}`,
  entities: [UserEntity, JournalEntity],
  migrations: ['src/migrations/*.ts'],
  synchronize: false, // important: use migrations, not sync
});
