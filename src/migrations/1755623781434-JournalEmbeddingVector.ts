import { MigrationInterface, QueryRunner } from "typeorm";

export class JournalEmbeddingVector1755623781434 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

        // change column type to vector with 1024 dimensions for Mistral embeddings
        await queryRunner.query(`
          ALTER TABLE journal
          ALTER COLUMN embeddings
          TYPE vector(1024)
          USING embeddings::vector
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE journal
            ALTER COLUMN embeddings
            TYPE float8[]
            USING ARRAY(embeddings)
          `);
    }

}
