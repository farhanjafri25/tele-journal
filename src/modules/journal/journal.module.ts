import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JournalEntity } from "./entites/journal.entity";
import { JournalService } from "./services/journal.service";
import { JournalRepository } from "./repositories/journal.repository";
import { JournalQueryService } from "./services/journal-query.service";
import { AiModule } from "../ai/ai.module";

@Module({
    imports: [TypeOrmModule.forFeature([JournalEntity]), AiModule],
    controllers: [],
    providers: [JournalService, JournalRepository, JournalQueryService],
    exports: [JournalService, JournalRepository, JournalQueryService],
})
export class JournalModule {}