import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JournalEntity } from "./entites/journal.entity";

@Module({
    imports: [TypeOrmModule.forFeature([JournalEntity])],
    controllers: [],
    providers: [],
    exports: [],
})
export class JournalModule {}