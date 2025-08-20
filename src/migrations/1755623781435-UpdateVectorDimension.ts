import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateVectorDimension1755623781435 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Update vector dimension from 1536 to 1024 for Mistral embeddings
        await queryRunner.query(`
          ALTER TABLE journal 
          ALTER COLUMN embeddings 
          TYPE vector(1024)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert back to 1536 dimensions for OpenAI embeddings
        await queryRunner.query(`
          ALTER TABLE journal 
          ALTER COLUMN embeddings 
          TYPE vector(1536)
        `);
    }
}
