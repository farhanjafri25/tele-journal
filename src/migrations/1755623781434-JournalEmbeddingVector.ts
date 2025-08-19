import { MigrationInterface, QueryRunner } from "typeorm";

export class JournalEmbeddingVector1755623781434 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

        // change column type to vector
        await queryRunner.query(`
          ALTER TABLE journals 
          ALTER COLUMN embedding 
          TYPE vector(1536) 
          USING embedding::vector
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE journals 
            ALTER COLUMN embedding 
            TYPE float8[]
            USING ARRAY(embedding)
          `);
    }

}
