import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { join } from "path";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = path.join(
    process.cwd(),
    process.env.NODE_ENV ? `envs/.env.${process.env.NODE_ENV}` : `/.env`,
  );
  
  dotenv.config({ path: envPath });
  
  console.log(`process.env.NODE_ENV`, process.env);
  
  export const postGresConfig: TypeOrmModuleOptions = {
    type: 'postgres',
    url: `${process.env.DATABASE_URL}`,
    synchronize: false,
    entities: [join(__dirname, '..', '**', '**', '*.entity.{js,ts}')],
    retryAttempts: 5,
    retryDelay: 5000,
    ssl: {
      rejectUnauthorized: false,
    },
  };
  